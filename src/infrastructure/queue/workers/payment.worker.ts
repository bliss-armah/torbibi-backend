import { Worker, Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { createWorkerConnection } from '../../cache/redis';
import { paystackService } from '../../payments/PaystackService';
import { OrderRepository } from '../../database/repositories/OrderRepository';
import { ShopRepository } from '../../database/repositories/ShopRepository';
import { PaymentRepository } from '../../database/repositories/PaymentRepository';
import { PayoutRepository } from '../../database/repositories/PayoutRepository';
import { PaymentVerifyJobData } from '../producers/payment.producer';
import { enqueueSms } from '../producers/sms.producer';
import { enqueuePayout } from '../producers/payout.producer';
import { QUEUE_NAMES, DEFAULT_COMMISSION_RATE } from '../../../shared/constants';
import { logger } from '../../../shared/utils/logger';

const orderRepo = new OrderRepository();
const shopRepo = new ShopRepository();
const paymentRepo = new PaymentRepository();
const payoutRepo = new PayoutRepository();

export function createPaymentWorker(): Worker {
  const worker = new Worker<PaymentVerifyJobData>(
    QUEUE_NAMES.PAYMENT_VERIFY,
    async (job: Job<PaymentVerifyJobData>) => {
      const { orderId, reference, shopId } = job.data;
      logger.info('Verifying payment', { orderId, reference });

      const [order, shop] = await Promise.all([
        orderRepo.findByIdAndShopId(orderId, shopId),
        shopRepo.findById(shopId),
      ]);

      if (!order || !shop) {
        logger.warn('Order or shop not found for payment verification', { orderId, shopId });
        return;
      }

      if (order.paymentStatus === 'paid') {
        logger.info('Order already marked as paid, skipping', { orderId });
        return;
      }

      const result = await paystackService.verifyPayment(reference);

      if (result.status === 'success') {
        // ─── 1. Mark order as paid ────────────────────────────────────────────
        order.markPaymentReceived(reference);
        await orderRepo.update(order);

        const amountGhs = (result.amount / 100).toFixed(2);

        // ─── 2. Update / create the Payment record with commission data ──────
        const commissionRate = DEFAULT_COMMISSION_RATE;
        const commissionAmount = Math.floor(result.amount * commissionRate);
        const netAmount = result.amount - commissionAmount;

        // Try to find an existing Payment record (created when order was placed)
        let payment = await paymentRepo.findByReference(reference);

        if (payment) {
          payment = await paymentRepo.update(payment.id, {
            status: 'paid',
            channel: result.channel,
            commissionRate,
            commissionAmount,
            netAmount,
          });
        } else {
          // Fallback: create it now if the controller didn't persist it earlier
          payment = await paymentRepo.create({
            orderId,
            shopId,
            amount: result.amount,
            reference,
            metadata: result.metadata,
          });
          payment = await paymentRepo.update(payment.id, {
            status: 'paid',
            channel: result.channel,
            commissionRate,
            commissionAmount,
            netAmount,
          });
        }

        // ─── 3. Create Payout record and enqueue transfer ─────────────────────
        const payoutReference = `PAY-${uuidv4().slice(0, 8).toUpperCase()}`;

        const payout = await payoutRepo.create({
          shopId,
          paymentId: payment.id,
          orderId,
          amount: netAmount,
          reference: payoutReference,
        });

        await enqueuePayout({ payoutId: payout.id, shopId, reference: payoutReference });

        logger.info('Payment verified — payout queued', {
          orderId,
          reference,
          commissionAmount,
          netAmount,
          payoutId: payout.id,
        });

        // ─── 4. SMS notifications ─────────────────────────────────────────────
        await Promise.all([
          enqueueSms({
            type: 'payment_confirmation',
            phone: order.customerPhone,
            orderNumber: order.orderNumber,
            amount: amountGhs,
          }),
          enqueueSms({
            type: 'shop_owner_new_order',
            phone: shop.phone,
            orderNumber: order.orderNumber,
            total: amountGhs,
          }),
        ]);
      } else if (result.status === 'failed') {
        order.markPaymentFailed();
        await orderRepo.update(order);

        // Update Payment record if it exists
        const payment = await paymentRepo.findByReference(reference);
        if (payment) await paymentRepo.update(payment.id, { status: 'failed' });

        logger.warn('Payment failed', { orderId, reference });
      }
    },
    {
      connection: createWorkerConnection(),
      concurrency: 3,
    }
  );

  worker.on('failed', (job, error) => {
    logger.error('Payment verify job failed', { jobId: job?.id, error: error.message });
  });

  return worker;
}
