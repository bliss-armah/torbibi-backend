import { Request, Response } from 'express';
import { CreateOrderUseCase } from '../../../application/orders/use-cases/CreateOrder';
import { OrderRepository } from '../../../infrastructure/database/repositories/OrderRepository';
import { ProductRepository } from '../../../infrastructure/database/repositories/ProductRepository';
import { ShopRepository } from '../../../infrastructure/database/repositories/ShopRepository';
import { UserRepository } from '../../../infrastructure/database/repositories/UserRepository';
import { PaymentRepository } from '../../../infrastructure/database/repositories/PaymentRepository';
import { CreateOrderDto, UpdateOrderStatusDto } from '../../../application/orders/dtos/order.dto';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../shared/errors';
import { User } from '../../../domain/users/entities/User';
import { parsePagination } from '../../../shared/utils/pagination';
import { paystackService } from '../../../infrastructure/payments/PaystackService';
import { enqueuePaymentVerification } from '../../../infrastructure/queue/producers/payment.producer';
import { enqueueSms } from '../../../infrastructure/queue/producers/sms.producer';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../../shared/utils/logger';
import prisma from '../../../infrastructure/database/prisma';


const orderRepo = new OrderRepository();
const productRepo = new ProductRepository();
const shopRepo = new ShopRepository();
const userRepo = new UserRepository();
const paymentRepo = new PaymentRepository();
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

    // Fetch shop for slug (callback URL) and subaccount code (split payments)
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { slug: true, subaccountCode: true },
    });
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3002';
    const callbackUrl = `${frontendUrl}/${shop?.slug ?? shopId}/checkout/confirmation?orderId=${order.id}&orderNumber=${encodeURIComponent(order.orderNumber)}`;

    const paystack = await paystackService.initializePayment({
      email: paystackEmail,
      amount: order.total,
      reference,
      phone: order.customerPhone,
      metadata: { orderId: order.id, shopId },
      callbackUrl,
      // If shop has registered a subaccount, Paystack splits automatically at payment time
      subaccount: shop?.subaccountCode ?? undefined,
      bearer: 'subaccount', // shop bears Paystack's transaction fee; platform earns via subscriptions
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

      // 2. Update payment record — split payment already handled by Paystack subaccount
      await paymentRepo.update(payment.id, { status: 'paid', channel: result.channel });

      // 3. SMS notifications
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

      logger.info('Payment verified via callback — SMS sent', { orderId, reference });
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

    // ─── Subscription events ──────────────────────────────────────────────────
    if (event === 'subscription.create') {
      const subData = data as {
        subscription_code: string;
        email_token: string;
        next_payment_date: string;
        customer: { customer_code: string; email: string };
        plan: { plan_code: string };
      };

      // Find which shop this subscription belongs to via the customer email
      const shopRow = await prisma.shop.findFirst({
        where: {
          owner: { email: subData.customer.email },
        },
        select: { id: true, name: true, owner: { select: { phone: true } } },
      });

      if (!shopRow) {
        logger.warn('subscription.create: no shop found for customer email', { email: subData.customer.email });
        return;
      }

      const periodEnd = new Date(subData.next_payment_date);
      const periodStart = new Date();

      await prisma.$transaction([
        prisma.shopSubscription.upsert({
          where: { shopId: shopRow.id },
          create: {
            shopId: shopRow.id,
            paystackPlanCode: subData.plan.plan_code,
            paystackSubscriptionCode: subData.subscription_code,
            paystackCustomerCode: subData.customer.customer_code,
            paystackEmailToken: subData.email_token,
            status: 'active',
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
          },
          update: {
            paystackSubscriptionCode: subData.subscription_code,
            paystackCustomerCode: subData.customer.customer_code,
            paystackEmailToken: subData.email_token,
            status: 'active',
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            cancelledAt: null,
          },
        }),
        prisma.shop.update({
          where: { id: shopRow.id },
          data: { subscriptionStatus: 'active' },
        }),
      ]);

      logger.info('Subscription created — shop activated', { shopId: shopRow.id, subscriptionCode: subData.subscription_code });
    }

    if (event === 'invoice.payment_success') {
      const invoiceData = data as {
        subscription: { subscription_code: string };
        period_start: string;
        period_end: string;
      };

      const sub = await prisma.shopSubscription.findFirst({
        where: { paystackSubscriptionCode: invoiceData.subscription.subscription_code },
      });
      if (!sub) return;

      await prisma.$transaction([
        prisma.shopSubscription.update({
          where: { id: sub.id },
          data: {
            status: 'active',
            currentPeriodStart: new Date(invoiceData.period_start),
            currentPeriodEnd: new Date(invoiceData.period_end),
          },
        }),
        prisma.shop.update({
          where: { id: sub.shopId },
          data: { subscriptionStatus: 'active' },
        }),
      ]);

      logger.info('Subscription renewed', { shopId: sub.shopId });
    }

    if (event === 'invoice.payment_failed') {
      const invoiceData = data as {
        subscription: { subscription_code: string };
      };

      const sub = await prisma.shopSubscription.findFirst({
        where: { paystackSubscriptionCode: invoiceData.subscription.subscription_code },
        include: { shop: { select: { id: true, name: true, owner: { select: { phone: true } } } } },
      });
      if (!sub) return;

      await prisma.$transaction([
        prisma.shopSubscription.update({
          where: { id: sub.id },
          data: { status: 'past_due' },
        }),
        prisma.shop.update({
          where: { id: sub.shopId },
          data: { subscriptionStatus: 'past_due' },
        }),
      ]);

      await enqueueSms({
        type: 'subscription_payment_failed',
        phone: sub.shop.owner.phone,
        shopName: sub.shop.name,
      });

      logger.warn('Subscription payment failed — shop marked past_due', { shopId: sub.shopId });
    }

    if (event === 'subscription.disable') {
      const disableData = data as { subscription_code: string };

      const sub = await prisma.shopSubscription.findFirst({
        where: { paystackSubscriptionCode: disableData.subscription_code },
        include: { shop: { select: { id: true, name: true, owner: { select: { phone: true } } } } },
      });
      if (!sub) return;

      // Only update if not already cancelled (may have been set by the cancel endpoint)
      if (sub.status !== 'cancelled') {
        await prisma.$transaction([
          prisma.shopSubscription.update({
            where: { id: sub.id },
            data: { status: 'cancelled', cancelledAt: new Date() },
          }),
          prisma.shop.update({
            where: { id: sub.shopId },
            data: { subscriptionStatus: 'cancelled' },
          }),
        ]);

        await enqueueSms({
          type: 'subscription_cancelled',
          phone: sub.shop.owner.phone,
          shopName: sub.shop.name,
        });
      }

      logger.info('Subscription disabled', { shopId: sub.shopId });
    }

  }
}
