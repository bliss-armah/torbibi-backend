import { IShopRepository } from '../../../domain/shops/repositories/IShopRepository';
import { IUserRepository } from '../../../domain/users/repositories/IUserRepository';
import { paystackService } from '../../../infrastructure/payments/PaystackService';
import { NotFoundError, ForbiddenError } from '../../../shared/errors';
import { v4 as uuidv4 } from 'uuid';

/**
 * Initializes a Paystack transaction that includes the platform subscription plan.
 * When the shop owner pays, Paystack automatically creates a subscription and fires
 * the subscription.create webhook which marks the shop as active.
 */
export class SubscribeShopUseCase {
  constructor(
    private readonly shopRepo: IShopRepository,
    private readonly userRepo: IUserRepository
  ) {}

  async execute(shopId: string, ownerId: string): Promise<{ authorizationUrl: string }> {
    const shop = await this.shopRepo.findById(shopId);
    if (!shop) throw new NotFoundError('Shop');
    if (!shop.isOwnedBy(ownerId)) throw new ForbiddenError('You do not own this shop');

    const user = await this.userRepo.findById(ownerId);
    if (!user) throw new NotFoundError('User');

    const planCode = process.env.PAYSTACK_PLAN_CODE;
    if (!planCode) throw new Error('PAYSTACK_PLAN_CODE is not configured');

    const amount = parseInt(process.env.SUBSCRIPTION_AMOUNT ?? '5000', 10); // default GHS 50
    const email = user.email ?? `${user.phone.replace(/\D/g, '')}@checkout.torbibi.com`;
    const reference = `SUB-${uuidv4().slice(0, 8).toUpperCase()}`;

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3002';
    const callbackUrl = `${frontendUrl}/dashboard/settings?subscribed=true`;

    const result = await paystackService.initializePayment({
      email,
      amount,
      reference,
      plan: planCode,
      callbackUrl,
      metadata: { shopId, type: 'subscription' },
    });

    return { authorizationUrl: result.authorizationUrl };
  }
}
