import { IShopRepository } from '../../../domain/shops/repositories/IShopRepository';
import { paystackService } from '../../../infrastructure/payments/PaystackService';
import { RegisterSubaccountDto } from '../dtos/payment.dto';
import { NotFoundError, ForbiddenError } from '../../../shared/errors';
import prisma from '../../../infrastructure/database/prisma';

/**
 * Register a shop's mobile money or bank account as a Paystack subaccount.
 *
 * The subaccount_code (ACCT_xxx) is stored on the Shop record and passed on every
 * transaction so Paystack automatically splits the payment:
 *   - Shop receives (100 - platformCommission)% directly into their MoMo/bank
 *   - Platform commission stays in the main Torbibi Paystack account
 *
 * Idempotent: calling again with new details creates a new subaccount and updates the shop.
 */
export class RegisterSubaccountUseCase {
  constructor(private readonly shopRepo: IShopRepository) {}

  async execute(shopId: string, ownerId: string, dto: RegisterSubaccountDto) {
    const shop = await this.shopRepo.findById(shopId);
    if (!shop) throw new NotFoundError('Shop');
    if (!shop.isOwnedBy(ownerId)) throw new ForbiddenError('You do not own this shop');

    const result = await paystackService.createSubaccount({
      businessName: shop.name,
      settlementBank: dto.bankCode,
      accountNumber: dto.accountNumber,
      percentageCharge: 0, // Platform earns via subscription fees, not per-transaction commission
      primaryContactName: dto.accountName,
    });

    // Persist subaccount details — stored so the settings page can repopulate the form on reload
    await prisma.shop.update({
      where: { id: shopId },
      data: {
        subaccountCode: result.subaccountCode,
        payoutType: dto.type,
        payoutAccountName: dto.accountName,
        payoutAccountNumber: dto.accountNumber,
        payoutBankCode: dto.bankCode,
      },
    });

    return {
      subaccountCode: result.subaccountCode,
      businessName: result.businessName,
      accountNumber: result.accountNumber,
      settlementBank: result.settlementBank,
      type: dto.type,
      accountName: dto.accountName,
    };
  }
}
