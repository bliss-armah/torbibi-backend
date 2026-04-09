import { paymentVerifyQueue } from '../queues';

export interface PaymentVerifyJobData {
  orderId: string;
  reference: string;
  shopId: string;
}

/**
 * Enqueue a deferred payment verification job.
 * Used when a webhook arrives but we want to verify server-side with a delay
 * to handle race conditions between webhook delivery and our DB writes.
 */
export async function enqueuePaymentVerification(
  data: PaymentVerifyJobData,
  delayMs = 2000
): Promise<void> {
  await paymentVerifyQueue.add('verify', data, { delay: delayMs });
}
