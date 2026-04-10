/**
 * Worker process entry point — runs in a separate container/process from the API.
 * This keeps background job processing from competing with HTTP request handling.
 */
import 'dotenv/config';
import { createSmsWorker } from '../../infrastructure/queue/workers/sms.worker';
import { createPaymentWorker } from '../../infrastructure/queue/workers/payment.worker';
import { checkRedisConnection } from '../../infrastructure/cache/redis';
import { logger } from '../../shared/utils/logger';

async function startWorkers(): Promise<void> {
  await checkRedisConnection();
  logger.info('Redis connected for workers');

  const workers = [
    createSmsWorker(),
    createPaymentWorker(),
  ];

  logger.info(`${workers.length} workers started`);

  const shutdown = async () => {
    logger.info('Shutting down workers...');
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startWorkers().catch((error: unknown) => {
  logger.error('Worker startup failed', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    error,
  });
  process.exit(1);
});
