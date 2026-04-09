import { PayoutRepository } from '../../../infrastructure/database/repositories/PayoutRepository';
import { TransferRecipientRepository } from '../../../infrastructure/database/repositories/TransferRecipientRepository';
import { paystackService } from '../../../infrastructure/payments/PaystackService';
import { logger } from '../../../shared/utils/logger';

/**
 * Process a pending payout by initiating a Paystack transfer.
 *
 * Called by the payout worker. Does NOT throw on Paystack failure — instead it
 * marks the payout as failed and stores the reason. The worker's retry policy
 * handles transient errors by throwing; permanent failures (no recipient) return early.
 *
 * Transfer lifecycle after this use case:
 *   Payout.status = 'processing' + transferCode stored
 *   → Paystack sends transfer.success / transfer.failed webhook
 *   → OrderController.paystackWebhook updates Payout to 'paid' or 'failed'
 */
export class ProcessPayoutUseCase {
  constructor(
    private readonly payoutRepo: PayoutRepository,
    private readonly recipientRepo: TransferRecipientRepository
  ) {}

  async execute(payoutId: string): Promise<void> {
    const payout = await this.payoutRepo.findById(payoutId);

    if (!payout) {
      logger.error('ProcessPayout: payout record not found', { payoutId });
      return;
    }

    if (payout.status !== 'pending') {
      logger.info('ProcessPayout: payout already processed, skipping', {
        payoutId,
        status: payout.status,
      });
      return;
    }

    // Look up the shop's registered transfer recipient
    const recipient = await this.recipientRepo.findByShopId(payout.shopId);

    if (!recipient) {
      // Shop has not registered a payout account — this is a permanent failure.
      // We mark it failed (not throw) so the job doesn't retry infinitely.
      await this.payoutRepo.update(payoutId, {
        status: 'failed',
        failureReason: 'Shop has not registered a payout account. Please register via /payments/recipients.',
      });
      logger.warn('ProcessPayout: no transfer recipient for shop — payout marked failed', {
        payoutId,
        shopId: payout.shopId,
      });
      return;
    }

    try {
      const amountGhs = (payout.amount / 100).toFixed(2);
      const transfer = await paystackService.initiateTransfer({
        amount: payout.amount,
        recipient: recipient.recipientCode,
        reason: `Torbibi payout for order — ${amountGhs} GHS`,
        reference: payout.reference,
      });

      await this.payoutRepo.update(payoutId, {
        status: 'processing',
        transferCode: transfer.transferCode,
      });

      logger.info('ProcessPayout: transfer initiated', {
        payoutId,
        transferCode: transfer.transferCode,
        amount: payout.amount,
      });
    } catch (error) {
      // Transient error — throw so the worker can retry with backoff
      logger.error('ProcessPayout: transfer initiation failed', { payoutId, error });
      throw error;
    }
  }
}
