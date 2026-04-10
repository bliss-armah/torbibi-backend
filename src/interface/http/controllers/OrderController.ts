import { Request, Response } from 'express';
import { CreateOrderUseCase } from '../../../application/orders/use-cases/CreateOrder';
import { OrderRepository } from '../../../infrastructure/database/repositories/OrderRepository';
import { ProductRepository } from '../../../infrastructure/database/repositories/ProductRepository';
import { ShopRepository } from '../../../infrastructure/database/repositories/ShopRepository';
import { UserRepository } from '../../../infrastructure/database/repositories/UserRepository';
import { PaymentRepository } from '../../../infrastructure/database/repositories/PaymentRepository';
import { PayoutRepository } from '../../../infrastructure/database/repositories/PayoutRepository';
import { CreateOrderDto, UpdateOrderStatusDto } from '../../../application/orders/dtos/order.dto';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../shared/errors';
import { User } from '../../../domain/users/entities/User';
import { parsePagination } from '../../../shared/utils/pagination';
import { paystackService } from '../../../infrastructure/payments/PaystackService';
import { enqueuePaymentVerification } from '../../../infrastructure/queue/producers/payment.producer';
import { enqueueSms } from '../../../infrastructure/queue/producers/sms.producer';
import { enqueuePayout } from '../../../infrastructure/queue/producers/payout.producer';
import { DEFAULT_COMMISSION_RATE } from '../../../shared/constants';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../../shared/utils/logger';

const orderRepo = new OrderRepository();
const productRepo = new ProductRepository();
const shopRepo = new ShopRepository();
const userRepo = new UserRepository();
const paymentRepo = new PaymentRepository();
const payoutRepo = new PayoutRepository();
const createOrderUseCase = new CreateOrderUseCase(orderRepo, productRepo, shopRepo, userRepo);

export class OrderController {
  static async create(req: Request, res: Response): Promise<void> {
    const { shopId } = req.params;
    const dto = req.body as CreateOrderDto;

    // Resolve customer: authenticated user or guest identified by their phone number.
    // For guests we find-or-create a minimal customer record so customerId is always set.
    let customerId: string;
    if (req.user?.sub) {
      customerId = req.user.sub;
    } else {
      const phone = dto.shippingAddress.phone;
      let existing = await userRepo.findByPhone(phone);
      if (!existing) {
        const guest = User.create({ phone, role: 'customer' });
        await userRepo.save(guest);
        existing = guest;
      }
      customerId = existing.id;
    }

    const order = await createOrderUseCase.execute(shopId, customerId, dto);

    const user = await userRepo.findById(customerId);
    const reference = `TRB-${uuidv4().slice(0, 8).toUpperCase()}`;

    // Build the Paystack email: prefer account email, then dto email, then a deterministic
    // placeholder so every order (including guest/phone-only) goes through Paystack.
    const paystackEmail =
      user?.email ??
      dto.email ??
      `${order.customerPhone.replace(/\D/g, '')}@checkout.torbibi.com`;

    // Fetch shop slug so the callback can land on the right storefront confirmation page
    const shop = await shopRepo.findById(shopId);
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3002';
    const callbackUrl = `${frontendUrl}/${shop?.slug ?? shopId}/checkout/confirmation?orderId=${order.id}&orderNumber=${encodeURIComponent(order.orderNumber)}`;

    const paystack = await paystackService.initializePayment({
      email: paystackEmail,
      amount: order.total,
      reference,
      phone: order.customerPhone,
      metadata: { orderId: order.id, shopId },
      callbackUrl,
    });

    // Persist the Payment record immediately so the worker can find it by reference.
    await paymentRepo.create({
      orderId: order.id,
      shopId,
      amount: order.total,
      reference,
      metadata: { orderId: order.id, shopId },
    });

    res.status(201).json({
      success: true,
      data: {
        order: order.toJSON(),
        paymentUrl: paystack.authorizationUrl,
        reference,
      },
    });
  }

  static async getMyOrders(req: Request, res: Response): Promise<void> {
    const pagination = parsePagination(req.query as Record<string, string>);
    const result = await orderRepo.findByCustomerId(req.user!.sub, pagination);

    // Batch-fetch shop slugs so the frontend can link back to the right shop
    const shopIds = [...new Set(result.data.map((o) => o.shopId))];
    const shops = await Promise.all(shopIds.map((id) => shopRepo.findById(id)));
    const slugMap: Record<string, string> = {};
    shops.forEach((shop) => { if (shop) slugMap[shop.id] = shop.slug; });

    const data = result.data.map((order) => ({
      ...order.toJSON(),
      shopSlug: slugMap[order.shopId] ?? null,
    }));

    res.status(200).json({ success: true, data: { ...result, data } });
  }

  static async getOne(req: Request, res: Response): Promise<void> {
    const { orderId } = req.params;
    const order = await orderRepo.findById(orderId);
    if (!order) throw new NotFoundError('Order');

    // If authenticated, verify ownership; if not, UUID is sufficient authorization (unguessable)
    if (req.user?.sub) {
      const shop = await shopRepo.findById(order.shopId);
      const isOwner = order.customerId === req.user.sub;
      const isShopOwner = shop?.isOwnedBy(req.user.sub) ?? false;
      if (!isOwner && !isShopOwner) throw new ForbiddenError('Access denied');
    }

    res.status(200).json({ success: true, data: { order: order.toJSON() } });
  }

  static async listForShop(req: Request, res: Response): Promise<void> {
    const { shopId } = req.params;
    const shop = await shopRepo.findById(shopId);
    if (!shop) throw new NotFoundError('Shop');
    if (!shop.isOwnedBy(req.user!.sub)) throw new ForbiddenError('You do not own this shop');

    const pagination = parsePagination(req.query as Record<string, string>);
    const filters = {
      status: req.query.status as import('../../../domain/orders/entities/Order').OrderStatus | undefined,
      paymentStatus: req.query.paymentStatus as import('../../../domain/orders/entities/Order').PaymentStatus | undefined,
    };

    const result = await orderRepo.findByShopId(shopId, pagination, filters);
    res.status(200).json({ success: true, data: result });
  }

  static async updateStatus(req: Request, res: Response): Promise<void> {
    const { shopId, orderId } = req.params;
    const dto = req.body as UpdateOrderStatusDto;

    const shop = await shopRepo.findById(shopId);
    if (!shop) throw new NotFoundError('Shop');
    if (!shop.isOwnedBy(req.user!.sub)) throw new ForbiddenError('You do not own this shop');

    const order = await orderRepo.findByIdAndShopId(orderId, shopId);
    if (!order) throw new NotFoundError('Order');

    switch (dto.status) {
      case 'processing': order.startProcessing(); break;
      case 'shipped': order.markShipped(); break;
      case 'delivered': order.markDelivered(); break;
      case 'cancelled':
        if (!dto.cancelReason) throw new ValidationError('Cancel reason is required', { cancelReason: ['Required'] });
        order.cancel(dto.cancelReason);
        break;
    }

    // Attach delivery logistics if provided (driver phone, vehicle number)
    if (dto.deliveryInfo) {
      order.setDeliveryInfo(dto.deliveryInfo);
    }

    await orderRepo.update(order);
    res.status(200).json({ success: true, data: { order: order.toJSON() } });
  }

  /**
   * Callback-triggered payment verification.
   *
   * Paystack appends ?reference=... to the callback URL after payment.
   * The frontend confirmation page calls this to verify and confirm the order
   * immediately — without waiting for the webhook (which can't reach localhost in dev).
   *
   * Idempotent: if already paid, returns the order as-is without re-processing.
   */
  static async verifyPayment(req: Request, res: Response): Promise<void> {
    const { orderId } = req.params;
    const reference = req.query.reference as string | undefined;

    if (!reference) throw new ValidationError('Reference is required', { reference: ['Required'] });

    // Find the payment record to get shopId (no auth — orderId UUID = access token)
    const payment = await paymentRepo.findByReference(reference);
    if (!payment) throw new NotFoundError('Payment');

    const [order, shop] = await Promise.all([
      orderRepo.findByIdAndShopId(orderId, payment.shopId),
      shopRepo.findById(payment.shopId),
    ]);
    if (!order || !shop) throw new NotFoundError('Order');

    // Already fully processed — return current state (idempotent)
    if (order.paymentStatus === 'paid') {
      res.status(200).json({ success: true, data: { order: order.toJSON() } });
      return;
    }

    const result = await paystackService.verifyPayment(reference);

    if (result.status === 'success') {
      // 1. Mark order confirmed
      order.markPaymentReceived(reference);
      await orderRepo.update(order);

      // 2. Update payment record with commission breakdown
      const commissionRate = DEFAULT_COMMISSION_RATE;
      const commissionAmount = Math.floor(result.amount * commissionRate);
      const netAmount = result.amount - commissionAmount;

      const updatedPayment = await paymentRepo.update(payment.id, {
        status: 'paid',
        channel: result.channel,
        commissionRate,
        commissionAmount,
        netAmount,
      });

      // 3. Create payout record and enqueue transfer to shop owner
      const payoutReference = `PAY-${uuidv4().slice(0, 8).toUpperCase()}`;
      const payout = await payoutRepo.create({
        shopId: payment.shopId,
        paymentId: updatedPayment.id,
        orderId,
        amount: netAmount,
        reference: payoutReference,
      });
      await enqueuePayout({ payoutId: payout.id, shopId: payment.shopId, reference: payoutReference });

      // 4. SMS notifications
      const amountGhs = (result.amount / 100).toFixed(2);
      await Promise.all([
        enqueueSms({
          type: 'payment_confirmation',
          phone: order.customerPhone,
          orderNumber: order.orderNumber,
          amount: amountGhs,
        }),
        enqueueSms({
          type: 'shop_owner_new_order',
          phone: shop.phone,
          orderNumber: order.orderNumber,
          total: amountGhs,
        }),
      ]);

      logger.info('Payment verified via callback — payout queued, SMS sent', { orderId, reference });
    } else if (result.status === 'failed') {
      order.markPaymentFailed();
      await orderRepo.update(order);
      await paymentRepo.update(payment.id, { status: 'failed' });
      logger.warn('Payment failed via callback', { orderId, reference });
    }

    res.status(200).json({ success: true, data: { order: order.toJSON() } });
  }

  /**
   * Paystack webhook handler.
   *
   * Handles both charge events (payment collected from customer)
   * and transfer events (payout sent to shop owner).
   *
   * NOTE: app.ts applies express.raw() to this route so req.body is a Buffer.
   * We must call .toString() before JSON.parse() for both signature validation
   * and event parsing. Using JSON.stringify(buffer) would produce garbage.
   */
  static async paystackWebhook(req: Request, res: Response): Promise<void> {
    const signature = req.headers['x-paystack-signature'] as string;

    // req.body is a Buffer (express.raw middleware)
    const rawBody = (req.body as Buffer).toString('utf-8');

    if (!paystackService.validateWebhookSignature(rawBody, signature)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const payload = JSON.parse(rawBody) as {
      event: string;
      data: Record<string, unknown>;
    };

    // Acknowledge immediately — Paystack requires a 200 within 10 seconds
    res.status(200).json({ received: true });

    const { event, data } = payload;

    // ─── Charge events (customer payment) ────────────────────────────────────
    if (event === 'charge.success') {
      const chargeData = data as {
        reference: string;
        metadata: { orderId: string; shopId: string };
      };

      // Defer verification with a 2s delay to handle race conditions between
      // webhook delivery and our DB writes completing
      await enqueuePaymentVerification(
        {
          orderId: chargeData.metadata.orderId,
          reference: chargeData.reference,
          shopId: chargeData.metadata.shopId,
        },
        2000
      );
    }

    // ─── Transfer events (payout to shop owner) ───────────────────────────────
    if (event === 'transfer.success' || event === 'transfer.failed' || event === 'transfer.reversed') {
      const transferData = data as {
        transfer_code: string;
        reference: string;
        status: string;
      };

      const payout = await payoutRepo.findByTransferCode(transferData.transfer_code);
      if (!payout) {
        logger.warn('Transfer webhook: no matching payout found', {
          transferCode: transferData.transfer_code,
        });
        return;
      }

      if (event === 'transfer.success') {
        await payoutRepo.update(payout.id, {
          status: 'paid',
          paidAt: new Date(),
        });
        logger.info('Payout completed', {
          payoutId: payout.id,
          amount: payout.amount,
          shopId: payout.shopId,
        });
      } else {
        await payoutRepo.update(payout.id, {
          status: 'failed',
          failureReason: `Transfer ${event.replace('transfer.', '')} — code: ${transferData.transfer_code}`,
        });
        logger.warn('Payout transfer failed', {
          payoutId: payout.id,
          event,
          transferCode: transferData.transfer_code,
        });
      }
    }
  }
}
