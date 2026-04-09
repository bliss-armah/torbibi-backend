import { PrismaClient } from '@prisma/client';
import { logger } from '../../shared/utils/logger';

// Single shared PrismaClient — Prisma manages its own connection pool internally.
// Do not instantiate PrismaClient per request or per repository.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'warn' },
            { emit: 'event', level: 'error' },
          ]
        : [{ emit: 'event', level: 'error' }],
  });

// Log slow queries in development to catch N+1 issues early
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query' as never, (e: { query: string; duration: number }) => {
    if (e.duration > 500) {
      logger.warn('Slow Prisma query', { query: e.query, durationMs: e.duration });
    }
  });
}

prisma.$on('error' as never, (e: { message: string }) => {
  logger.error('Prisma error', { message: e.message });
});

// Prevent multiple instances during hot-reload in development
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function checkDatabaseConnection(): Promise<void> {
  await prisma.$connect();
}

export default prisma;
