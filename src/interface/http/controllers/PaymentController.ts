import { Request, Response } from 'express';
import { ShopRepository } from '../../../infrastructure/database/repositories/ShopRepository';
import { RegisterSubaccountUseCase } from '../../../application/payments/use-cases/RegisterSubaccount';
import { RegisterSubaccountDto } from '../../../application/payments/dtos/payment.dto';
import { NotFoundError, ForbiddenError } from '../../../shared/errors';
import prisma from '../../../infrastructure/database/prisma';

const shopRepo = new ShopRepository();
const registerSubaccountUseCase = new RegisterSubaccountUseCase(shopRepo);

export class PaymentController {
  /**
   * POST /payments/subaccount/shop/:shopId
   * Register or update a shop's payout account as a Paystack subaccount.
   * The subaccount_code is stored on the shop and used to auto-split every payment.
   */
  static async registerSubaccount(req: Request, res: Response): Promise<void> {
    const { shopId } = req.params;
    const dto = req.body as RegisterSubaccountDto;

    const result = await registerSubaccountUseCase.execute(shopId, req.user!.sub, dto);

    res.status(200).json({
      success: true,
      data: { subaccount: result },
      message: 'Payout account registered successfully',
    });
  }

  /**
   * GET /payments/subaccount/shop/:shopId
   * Get the current payout subaccount for a shop.
   */
  static async getSubaccount(req: Request, res: Response): Promise<void> {
    const { shopId } = req.params;

    const shop = await shopRepo.findById(shopId);
    if (!shop) throw new NotFoundError('Shop');
    if (!shop.isOwnedBy(req.user!.sub)) throw new ForbiddenError('You do not own this shop');

    const row = await prisma.shop.findUnique({
      where: { id: shopId },
      select: {
        subaccountCode: true,
        payoutType: true,
        payoutAccountName: true,
        payoutAccountNumber: true,
        payoutBankCode: true,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        subaccountCode: row?.subaccountCode ?? null,
        type: row?.payoutType ?? null,
        accountName: row?.payoutAccountName ?? null,
        accountNumber: row?.payoutAccountNumber ?? null,
        bankCode: row?.payoutBankCode ?? null,
      },
    });
  }
}
