import { Worker, Job } from 'bullmq';
import { createWorkerConnection } from '../../cache/redis';
import { PayoutRepository } from '../../database/repositories/PayoutRepository';
import { TransferRecipientRepository } from '../../database/repositories/TransferRecipientRepository';
import { ProcessPayoutUseCase } from '../../../application/payments/use-cases/ProcessPayout';
import { PayoutJobData } from '../producers/payout.producer';
import { QUEUE_NAMES } from '../../../shared/constants';
import { logger } from '../../../shared/utils/logger';

const payoutRepo = new PayoutRepository();
const recipientRepo = new TransferRecipientRepository();
const processPayoutUseCase = new ProcessPayoutUseCase(payoutRepo, recipientRepo);

/**
 * Payout worker — initiates Paystack transfers for pending payouts.
 *
 * Concurrency = 2: payout transfers are not high-throughput and the Paystack
 * Transfers API has rate limits. Low concurrency avoids overwhelming it.
 *
 * After this worker runs, the payout enters 'processing' status.
 * Final status (paid / failed) arrives via Paystack transfer webhook events.
 */
export function createPayoutWorker(): Worker {
  const worker = new Worker<PayoutJobData>(
    QUEUE_NAMES.PAYOUT,
    async (job: Job<PayoutJobData>) => {
      const { payoutId, reference } = job.data;
      logger.info('Processing payout', { payoutId, reference });

      await processPayoutUseCase.execute(payoutId);
    },
    {
      connection: createWorkerConnection(),
      concurrency: 2,
    }
  );

  worker.on('failed', (job, error) => {
    logger.error('Payout job failed', {
      jobId: job?.id,
      payoutId: job?.data?.payoutId,
      error: error.message,
    });
  });

  worker.on('completed', (job) => {
    logger.info('Payout job completed', {
      jobId: job.id,
      payoutId: job.data.payoutId,
    });
  });

  return worker;
}
