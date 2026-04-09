import { Request, Response } from 'express';
import { ShopRepository } from '../../../infrastructure/database/repositories/ShopRepository';
import { PayoutRepository } from '../../../infrastructure/database/repositories/PayoutRepository';
import { TransferRecipientRepository } from '../../../infrastructure/database/repositories/TransferRecipientRepository';
import { RegisterTransferRecipientUseCase } from '../../../application/payments/use-cases/RegisterTransferRecipient';
import { RegisterRecipientDto } from '../../../application/payments/dtos/payment.dto';
import { NotFoundError, ForbiddenError } from '../../../shared/errors';
import { parsePagination } from '../../../shared/utils/pagination';

const shopRepo = new ShopRepository();
const payoutRepo = new PayoutRepository();
const recipientRepo = new TransferRecipientRepository();
const registerRecipientUseCase = new RegisterTransferRecipientUseCase(shopRepo, recipientRepo);

export class PaymentController {
  /**
   * POST /payments/recipients/shop/:shopId
   * Register or update a shop's payout account (mobile money or bank).
   * Must be completed before any payouts can be sent to the shop.
   */
  static async registerRecipient(req: Request, res: Response): Promise<void> {
    const { shopId } = req.params;
    const dto = req.body as RegisterRecipientDto;

    const recipient = await registerRecipientUseCase.execute(shopId, req.user!.sub, dto);

    res.status(200).json({
      success: true,
      data: { recipient },
      message: 'Payout account registered successfully',
    });
  }

  /**
   * GET /payments/recipients/shop/:shopId
   * Get the current payout account for a shop.
   */
  static async getRecipient(req: Request, res: Response): Promise<void> {
    const { shopId } = req.params;

    const shop = await shopRepo.findById(shopId);
    if (!shop) throw new NotFoundError('Shop');
    if (!shop.isOwnedBy(req.user!.sub)) throw new ForbiddenError('You do not own this shop');

    const recipient = await recipientRepo.findByShopId(shopId);

    res.status(200).json({
      success: true,
      data: { recipient: recipient ?? null },
    });
  }

  /**
   * GET /payments/payouts/shop/:shopId
   * List all payouts for a shop (paginated).
   */
  static async listPayouts(req: Request, res: Response): Promise<void> {
    const { shopId } = req.params;

    const shop = await shopRepo.findById(shopId);
    if (!shop) throw new NotFoundError('Shop');
    if (!shop.isOwnedBy(req.user!.sub)) throw new ForbiddenError('You do not own this shop');

    const { page, limit } = parsePagination(req.query as Record<string, string>);
    const skip = (page - 1) * limit;

    const result = await payoutRepo.findByShopId(shopId, limit, skip);

    res.status(200).json({
      success: true,
      data: {
        payouts: result.items,
        pagination: {
          total: result.total,
          page,
          limit,
          totalPages: Math.ceil(result.total / limit),
        },
      },
    });
  }
}
