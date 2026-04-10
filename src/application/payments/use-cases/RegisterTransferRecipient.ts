import { IShopRepository } from '../../../domain/shops/repositories/IShopRepository';
import { TransferRecipientRepository } from '../../../infrastructure/database/repositories/TransferRecipientRepository';
import { paystackService } from '../../../infrastructure/payments/PaystackService';
import { RegisterRecipientDto } from '../dtos/payment.dto';
import { NotFoundError, ForbiddenError } from '../../../shared/errors';

/**
 * Register a shop's mobile money or bank account as a Paystack transfer recipient.
 *
 * The flow:
 * 1. Verify shop exists and caller is the owner.
 * 2. Call Paystack to create/register the recipient — they validate account details.
 * 3. Upsert the recipient record (one per shop, updating if details change).
 *
 * Idempotent: calling again with new details replaces the previous recipient.
 */
export class RegisterTransferRecipientUseCase {
  constructor(
    private readonly shopRepo: IShopRepository,
    private readonly recipientRepo: TransferRecipientRepository
  ) {}

  async execute(shopId: string, ownerId: string, dto: RegisterRecipientDto) {
    const shop = await this.shopRepo.findById(shopId);
    if (!shop) throw new NotFoundError('Shop');
    if (!shop.isOwnedBy(ownerId)) throw new ForbiddenError('You do not own this shop');

    // Register with Paystack — they validate the account details server-side
    const result = await paystackService.createTransferRecipient({
      type: dto.type,
      name: dto.accountName,
      accountNumber: dto.accountNumber,
      bankCode: dto.bankCode,
    });

    // Upsert so re-registration (e.g. changing mobile network) works cleanly
    const recipient = await this.recipientRepo.upsert({
      shopId,
      recipientCode: result.recipientCode,
      type: result.type,
      // Paystack returns null accountName for mobile money — fall back to what the user entered
      accountName: result.accountName || dto.accountName,
      accountNumber: result.accountNumber,
      bankCode: result.bankCode,
    });

    return recipient;
  }
}
