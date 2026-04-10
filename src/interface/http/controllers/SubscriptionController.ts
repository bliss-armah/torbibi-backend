import { Request, Response } from 'express';
import { ShopRepository } from '../../../infrastructure/database/repositories/ShopRepository';
import { UserRepository } from '../../../infrastructure/database/repositories/UserRepository';
import { SubscribeShopUseCase } from '../../../application/subscriptions/use-cases/SubscribeShop';
import { CancelSubscriptionUseCase } from '../../../application/subscriptions/use-cases/CancelSubscription';
import { NotFoundError, ForbiddenError } from '../../../shared/errors';
import prisma from '../../../infrastructure/database/prisma';

const shopRepo = new ShopRepository();
const userRepo = new UserRepository();
const subscribeShopUseCase = new SubscribeShopUseCase(shopRepo, userRepo);
const cancelSubscriptionUseCase = new CancelSubscriptionUseCase(shopRepo);

export class SubscriptionController {
  /**
   * POST /subscriptions/shop/:shopId
   * Returns a Paystack authorization URL for the shop owner to complete payment.
   * Paystack creates the subscription automatically after successful payment.
   */
  static async subscribe(req: Request, res: Response): Promise<void> {
    const { shopId } = req.params;
    const result = await subscribeShopUseCase.execute(shopId, req.user!.sub);
    res.status(200).json({ success: true, data: result });
  }

  /**
   * GET /subscriptions/shop/:shopId
   * Returns current subscription status and trial info for the settings page.
   */
  static async getStatus(req: Request, res: Response): Promise<void> {
    const { shopId } = req.params;

    const shop = await shopRepo.findById(shopId);
    if (!shop) throw new NotFoundError('Shop');
    if (!shop.isOwnedBy(req.user!.sub)) throw new ForbiddenError('You do not own this shop');

    const [row, sub] = await Promise.all([
      prisma.shop.findUnique({
        where: { id: shopId },
        select: { subscriptionStatus: true, trialEndsAt: true },
      }),
      prisma.shopSubscription.findUnique({ where: { shopId } }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        subscriptionStatus: row?.subscriptionStatus ?? 'trialing',
        trialEndsAt: row?.trialEndsAt ?? null,
        currentPeriodEnd: sub?.currentPeriodEnd ?? null,
        paystackSubscriptionCode: sub?.paystackSubscriptionCode ?? null,
      },
    });
  }

  /**
   * DELETE /subscriptions/shop/:shopId
   * Cancels the active Paystack subscription.
   */
  static async cancel(req: Request, res: Response): Promise<void> {
    const { shopId } = req.params;
    await cancelSubscriptionUseCase.execute(shopId, req.user!.sub);
    res.status(200).json({ success: true, message: 'Subscription cancelled' });
  }
}
