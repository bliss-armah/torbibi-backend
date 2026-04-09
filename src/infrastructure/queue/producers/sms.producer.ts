import { smsQueue } from '../queues';

export type SmsJobData =
  | { type: 'otp'; phone: string; code: string }
  | { type: 'order_confirmation'; phone: string; orderNumber: string; shopName: string }
  | { type: 'payment_confirmation'; phone: string; orderNumber: string; amount: string }
  | { type: 'shop_owner_new_order'; phone: string; orderNumber: string; total: string };

export async function enqueueSms(data: SmsJobData): Promise<void> {
  await smsQueue.add(data.type, data, {
    // OTPs are time-sensitive — skip delay; put on top of queue
    priority: data.type === 'otp' ? 1 : 10,
  });
}
