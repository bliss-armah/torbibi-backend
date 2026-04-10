import { IShopRepository } from '../../../domain/shops/repositories/IShopRepository';
import { paystackService } from '../../../infrastructure/payments/PaystackService';
import { NotFoundError, ForbiddenError } from '../../../shared/errors';
import prisma from '../../../infrastructure/database/prisma';

export class CancelSubscriptionUseCase {
  constructor(private readonly shopRepo: IShopRepository) {}

  async execute(shopId: string, ownerId: string): Promise<void> {
    const shop = await this.shopRepo.findById(shopId);
    if (!shop) throw new NotFoundError('Shop');
    if (!shop.isOwnedBy(ownerId)) throw new ForbiddenError('You do not own this shop');

    const sub = await prisma.shopSubscription.findUnique({ where: { shopId } });
    if (!sub || !sub.paystackSubscriptionCode || !sub.paystackEmailToken) {
      throw new NotFoundError('Active subscription');
    }

    await paystackService.disableSubscription(
      sub.paystackSubscriptionCode,
      sub.paystackEmailToken
    );

    // Local state updated immediately; webhook (subscription.disable) will also fire
    await prisma.$transaction([
      prisma.shopSubscription.update({
        where: { shopId },
        data: { status: 'cancelled', cancelledAt: new Date() },
      }),
      prisma.shop.update({
        where: { id: shopId },
        data: { subscriptionStatus: 'cancelled' },
      }),
    ]);
  }
}
