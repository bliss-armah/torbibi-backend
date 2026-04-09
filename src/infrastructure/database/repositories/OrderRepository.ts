import { Prisma, Order as PrismaOrder } from '@prisma/client';
import { IOrderRepository, OrderFilters } from '../../../domain/orders/repositories/IOrderRepository';
import { Order, OrderItem, OrderStatus, PaymentStatus, ShippingAddress } from '../../../domain/orders/entities/Order';
import { PaginatedResult, PaginationParams } from '../../../shared/types';
import { buildPaginatedResult, paginationOffset } from '../../../shared/utils/pagination';
import prisma from '../prisma';

function toOrder(row: PrismaOrder): Order {
  return Order.reconstitute({
    id: row.id,
    orderNumber: row.orderNumber,
    shopId: row.shopId,
    customerId: row.customerId,
    customerPhone: row.customerPhone,
    items: row.items as unknown as OrderItem[],
    subtotal: row.subtotal,
    deliveryFee: row.deliveryFee,
    total: row.total,
    status: row.status as OrderStatus,
    paymentStatus: row.paymentStatus as PaymentStatus,
    paymentReference: row.paymentReference,
    shippingAddress: row.shippingAddress as unknown as ShippingAddress,
    notes: row.notes,
    cancelReason: row.cancelReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class OrderRepository implements IOrderRepository {
  async save(order: Order): Promise<void> {
    const d = order.toJSON();
    await prisma.order.create({
      data: {
        id: d.id,
        orderNumber: d.orderNumber,
        shopId: d.shopId,
        customerId: d.customerId,
        customerPhone: d.customerPhone,
        items: d.items as unknown as Prisma.InputJsonValue,
        subtotal: d.subtotal,
        deliveryFee: d.deliveryFee,
        total: d.total,
        status: d.status,
        paymentStatus: d.paymentStatus,
        paymentReference: d.paymentReference,
        shippingAddress: d.shippingAddress as unknown as Prisma.InputJsonValue,
        notes: d.notes,
        cancelReason: d.cancelReason,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      },
    });
  }

  async update(order: Order): Promise<void> {
    const d = order.toJSON();
    await prisma.order.update({
      where: { id: d.id },
      data: {
        status: d.status,
        paymentStatus: d.paymentStatus,
        paymentReference: d.paymentReference,
        cancelReason: d.cancelReason,
      },
    });
  }

  async findById(id: string): Promise<Order | null> {
    const row = await prisma.order.findUnique({ where: { id } });
    return row ? toOrder(row) : null;
  }

  async findByOrderNumber(orderNumber: string): Promise<Order | null> {
    const row = await prisma.order.findUnique({ where: { orderNumber } });
    return row ? toOrder(row) : null;
  }

  async findByIdAndShopId(id: string, shopId: string): Promise<Order | null> {
    const row = await prisma.order.findUnique({ where: { id, shopId } });
    return row ? toOrder(row) : null;
  }

  async findByShopId(
    shopId: string,
    params: PaginationParams,
    filters?: OrderFilters
  ): Promise<PaginatedResult<Order>> {
    const where: Prisma.OrderWhereInput = { shopId };
    if (filters?.status) where.status = filters.status;
    if (filters?.customerId) where.customerId = filters.customerId;
    if (filters?.paymentStatus) where.paymentStatus = filters.paymentStatus as PaymentStatus;

    const [rows, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        skip: paginationOffset(params),
        take: params.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where }),
    ]);
    return buildPaginatedResult(rows.map(toOrder), total, params);
  }

  async findByCustomerId(
    customerId: string,
    params: PaginationParams
  ): Promise<PaginatedResult<Order>> {
    const [rows, total] = await prisma.$transaction([
      prisma.order.findMany({
        where: { customerId },
        skip: paginationOffset(params),
        take: params.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where: { customerId } }),
    ]);
    return buildPaginatedResult(rows.map(toOrder), total, params);
  }

  async findByPaymentReference(reference: string): Promise<Order | null> {
    const row = await prisma.order.findFirst({
      where: { paymentReference: reference },
    });
    return row ? toOrder(row) : null;
  }

  /**
   * Atomically increments a per-shop counter and returns the order number.
   * prisma.orderCounter.upsert with `increment` generates an atomic
   * INSERT ... ON CONFLICT DO UPDATE SET counter = counter + 1 in PostgreSQL,
   * which is safe under concurrent load without needing an explicit sequence.
   */
  async getNextOrderNumber(shopId: string): Promise<string> {
    const record = await prisma.orderCounter.upsert({
      where: { shopId },
      update: { counter: { increment: 1 } },
      create: { shopId, counter: 1 },
      select: { counter: true },
    });
    return `TRB-${record.counter.toString().padStart(6, '0')}`;
  }
}
