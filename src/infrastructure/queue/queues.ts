import { Queue } from 'bullmq';
import redis from '../cache/redis';
import { QUEUE_NAMES } from '../../shared/constants';

const connection = redis;

// One queue per concern — keeps job types isolated and observable
export const smsQueue = new Queue(QUEUE_NAMES.SMS, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export const orderQueue = new Queue(QUEUE_NAMES.ORDER, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

export const paymentVerifyQueue = new Queue(QUEUE_NAMES.PAYMENT_VERIFY, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});

