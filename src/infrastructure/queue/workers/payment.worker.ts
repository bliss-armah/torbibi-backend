import { Worker, Job } from 'bullmq';
import { createWorkerConnection } from '../../cache/redis';
import { paystackService } from '../../payments/PaystackService';
import { OrderRepository } from '../../database/repositories/OrderRepository';
import { ShopRepository } from '../../database/repositories/ShopRepository';
import { PaymentRepository } from '../../database/repositories/PaymentRepository';
import { PaymentVerifyJobData } from '../producers/payment.producer';
import { enqueueSms } from '../producers/sms.producer';
import { QUEUE_NAMES } from '../../../shared/constants';
import { logger } from '../../../shared/utils/logger';

const orderRepo = new OrderRepository();
const shopRepo = new ShopRepository();
const paymentRepo = new PaymentRepository();

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
        // 1. Mark order confirmed
        order.markPaymentReceived(reference);
        await orderRepo.update(order);

        // 2. Update payment record
        let payment = await paymentRepo.findByReference(reference);
        if (payment) {
          await paymentRepo.update(payment.id, { status: 'paid', channel: result.channel });
        } else {
          payment = await paymentRepo.create({ orderId, shopId, amount: result.amount, reference, metadata: result.metadata });
          await paymentRepo.update(payment.id, { status: 'paid', channel: result.channel });
        }

        // 3. SMS notifications
        const amountGhs = (result.amount / 100).toFixed(2);
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

        logger.info('Payment verified via webhook', { orderId, reference });
      } else if (result.status === 'failed') {
        order.markPaymentFailed();
        await orderRepo.update(order);
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
