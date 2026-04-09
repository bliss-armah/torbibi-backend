import winston from 'winston';
import path from 'path';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

// Human-readable format for development
const devFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `${ts} [${level}]: ${stack ?? message}`;
});

const isProduction = process.env.NODE_ENV === 'production';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    isProduction ? json() : combine(colorize(), devFormat)
  ),
  defaultMeta: { service: 'torbibi-backend' },
  transports: [
    new winston.transports.Console(),
    // Structured JSON logs for production ingestion (Datadog, CloudWatch, etc.)
    ...(isProduction
      ? [
          new winston.transports.File({
            filename: path.join(process.env.LOG_DIR ?? './logs', 'error.log'),
            level: 'error',
          }),
          new winston.transports.File({
            filename: path.join(process.env.LOG_DIR ?? './logs', 'combined.log'),
          }),
        ]
      : []),
  ],
});
