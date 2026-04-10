import { Worker, Job } from 'bullmq';
import { createWorkerConnection } from '../../cache/redis';
import { smsService } from '../../sms/SmsService';
import { SmsJobData } from '../producers/sms.producer';
import { QUEUE_NAMES } from '../../../shared/constants';
import { logger } from '../../../shared/utils/logger';

export function createSmsWorker(): Worker {
  const worker = new Worker<SmsJobData>(
    QUEUE_NAMES.SMS,
    async (job: Job<SmsJobData>) => {
      const { data } = job;
      logger.info('Processing SMS job', { type: data.type, jobId: job.id });

      let result;

      switch (data.type) {
        case 'otp':
          result = await smsService.sendOtp(data.phone, data.code);
          break;

        case 'order_confirmation':
          result = await smsService.sendOrderConfirmation(
            data.phone,
            data.orderNumber,
            data.shopName
          );
          break;

        case 'payment_confirmation':
          result = await smsService.sendPaymentConfirmation(
            data.phone,
            data.orderNumber,
            data.amount
          );
          break;

        case 'shop_owner_new_order':
          result = await smsService.sendShopOwnerNewOrder(
            data.phone,
            data.orderNumber,
            data.total
          );
          break;

        case 'subscription_payment_failed':
          result = await smsService.sendSubscriptionPaymentFailed(data.phone, data.shopName);
          break;

        case 'subscription_cancelled':
          result = await smsService.sendSubscriptionCancelled(data.phone, data.shopName);
          break;

        default:
          throw new Error(`Unknown SMS job type: ${(data as SmsJobData).type}`);
      }

      if (!result.success) {
        throw new Error(`SMS send failed: ${result.error}`);
      }

      logger.info('SMS sent successfully', { type: data.type, messageId: result.messageId });
    },
    {
      connection: createWorkerConnection(),
      concurrency: 5,
    }
  );

  worker.on('failed', (job, error) => {
    logger.error('SMS job failed', { jobId: job?.id, error: error.message });
  });

  return worker;
}
