import { payoutQueue } from '../queues';

export interface PayoutJobData {
  payoutId: string;
  shopId: string;
  reference: string;
}

/**
 * Enqueue a payout processing job.
 * Called after a payment is verified and the Payout record is created.
 * A short delay gives Prisma time to commit the Payout row before the worker reads it.
 */
export async function enqueuePayout(data: PayoutJobData, delayMs = 3000): Promise<void> {
  await payoutQueue.add('process', data, { delay: delayMs });
}
