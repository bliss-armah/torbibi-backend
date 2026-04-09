import 'dotenv/config';
import { execSync } from 'child_process';
import { createApp } from './app';
import { checkDatabaseConnection, prisma } from './infrastructure/database/prisma';
import { checkRedisConnection } from './infrastructure/cache/redis';
import { logger } from './shared/utils/logger';

const PORT = parseInt(process.env.PORT ?? '4030', 10);

async function bootstrap(): Promise<void> {
  await checkDatabaseConnection();
  logger.info('Database connected');

  try {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    logger.info('Database migrations applied');
  } catch (err) {
    logger.error('Migration failed — aborting startup', { error: (err as Error).message });
    process.exit(1);
  }

  await checkRedisConnection();
  logger.info('Redis connected');

  const app = createApp();

  const server = app.listen(PORT, () => {
    logger.info(`Torbibi API running on port ${PORT}`, {
      env: process.env.NODE_ENV,
      port: PORT,
    });
  });

  const gracefulShutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Database disconnected');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception — process will exit', { error: (error as Error).message });
    process.exit(1);
  });
}

bootstrap().catch((error) => {
  logger.error('Bootstrap failed', { error });
  process.exit(1);
});
