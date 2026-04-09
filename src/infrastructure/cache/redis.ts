import Redis from 'ioredis';
import { logger } from '../../shared/utils/logger';

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 3) {
      logger.error('Redis connection failed after 3 retries');
      return null; // Stop retrying
    }
    return Math.min(times * 50, 2000);
  },
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error('Redis error', { error: err.message }));

export async function cacheGet<T>(key: string): Promise<T | null> {
  const value = await redis.get(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as unknown as T;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<void> {
  const serialized = JSON.stringify(value);
  if (ttlSeconds) {
    await redis.setex(key, ttlSeconds, serialized);
  } else {
    await redis.set(key, serialized);
  }
}

export async function cacheDel(key: string): Promise<void> {
  await redis.del(key);
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  // Use SCAN to avoid blocking Redis with KEYS in production
  const stream = redis.scanStream({ match: pattern, count: 100 });
  const pipeline = redis.pipeline();
  let count = 0;

  for await (const keys of stream) {
    const keyList = keys as string[];
    keyList.forEach((key) => {
      pipeline.del(key);
      count++;
    });
  }

  if (count > 0) await pipeline.exec();
}

export async function cacheIncr(key: string, ttlSeconds?: number): Promise<number> {
  const count = await redis.incr(key);
  if (count === 1 && ttlSeconds) {
    await redis.expire(key, ttlSeconds);
  }
  return count;
}

export async function checkRedisConnection(): Promise<void> {
  await redis.ping();
}

/**
 * Returns a fresh IORedis connection configured for BullMQ workers.
 *
 * BullMQ workers use blocking commands (BRPOP) which require:
 *   - maxRetriesPerRequest: null  — don't give up on blocking commands
 *   - enableReadyCheck: false     — BullMQ manages its own readiness
 *   - A DEDICATED connection (not the shared app singleton)
 *
 * Call this once per Worker instance — do not reuse the returned connection.
 */
export function createWorkerConnection(): Redis {
  return new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export default redis;
