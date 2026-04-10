import { IOrderRepository } from '../../../domain/orders/repositories/IOrderRepository';
import { IProductRepository } from '../../../domain/products/repositories/IProductRepository';
import { IShopRepository } from '../../../domain/shops/repositories/IShopRepository';
import { IUserRepository } from '../../../domain/users/repositories/IUserRepository';
import { Order, OrderItem } from '../../../domain/orders/entities/Order';
import { CreateOrderDto } from '../dtos/order.dto';
import { NotFoundError, ValidationError, ForbiddenError } from '../../../shared/errors';
import prisma from '../../../infrastructure/database/prisma';

export class CreateOrderUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly productRepo: IProductRepository,
    private readonly shopRepo: IShopRepository,
    private readonly userRepo: IUserRepository
  ) {}

  async execute(shopId: string, customerId: string, dto: CreateOrderDto): Promise<Order> {
    const [shop, customer] = await Promise.all([
      this.shopRepo.findById(shopId),
      this.userRepo.findById(customerId),
    ]);

    if (!shop) throw new NotFoundError('Shop');
    if (!shop.isActive()) throw new ForbiddenError('This shop is not currently accepting orders');
    if (!customer) throw new NotFoundError('User');

    // Validate all items before touching the database
    const resolvedItems: OrderItem[] = [];
    const validationErrors: Record<string, string[]> = {};

    for (const item of dto.items) {
      const product = await this.productRepo.findByIdAndShopId(item.productId, shopId);

      if (!product) {
        validationErrors[item.productId] = ['Product not found in this shop'];
        continue;
      }
      if (!product.isAvailable()) {
        validationErrors[item.productId] = ['Product is not available'];
        continue;
      }
      if (product.trackInventory && product.quantity < item.quantity) {
        validationErrors[item.productId] = [
          `Insufficient stock. Available: ${product.quantity}`,
        ];
        continue;
      }

      resolvedItems.push({
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        quantity: item.quantity,
        unitPrice: product.price,
        totalPrice: product.price * item.quantity,
      });
    }

    if (Object.keys(validationErrors).length > 0) {
      throw new ValidationError('Some products are unavailable', validationErrors);
    }

    const orderNumber = await this.orderRepo.getNextOrderNumber(shopId);

    const order = Order.create({
      shopId,
      customerId,
      customerPhone: customer.phone,
      items: resolvedItems,
      deliveryFee: dto.deliveryFee,
      shippingAddress: dto.shippingAddress,
      orderNumber,
      notes: dto.notes,
    });

    // Atomic transaction: persist the order and decrement inventory together.
    // If stock decrement fails (e.g. race condition), the whole operation rolls back.
    await prisma.$transaction(async (tx) => {
      // Save order via raw Prisma to stay within the transaction
      await tx.order.create({
        data: {
          id: order.id,
          orderNumber: order.orderNumber,
          shopId: order.shopId,
          customerId: order.customerId,
          customerPhone: order.customerPhone,
          items: order.items as object[],
          subtotal: order.subtotal,
          deliveryFee: order.deliveryFee,
          total: order.total,
          status: order.status,
          paymentStatus: order.paymentStatus,
          paymentReference: order.paymentReference,
          shippingAddress: order.shippingAddress as object,
          notes: order.notes,
          cancelReason: order.cancelReason,
        },
      });

      // Decrement inventory for tracked products within the same transaction
      const trackedItems = dto.items.filter((_, i) => resolvedItems[i] !== undefined);
      for (const item of trackedItems) {
        const product = await this.productRepo.findByIdAndShopId(item.productId, shopId);
        if (!product?.trackInventory) continue;

        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.quantity } },
        });
      }
    });

    return order;
  }
}
