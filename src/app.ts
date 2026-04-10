import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import routes from './interface/http/routes';
import { errorHandler } from './interface/http/middleware/error.middleware';
import { logger } from './shared/utils/logger';
import { ValidationError } from './shared/errors';

export function createApp(): Application {
  const app = express();

  app.use(helmet());

  app.use(
    cors({
      origin: '*',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    })
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(compression() as any);

  // HTTP request logging
  app.use(
    morgan('combined', {
      stream: { write: (message) => logger.http(message.trim()) },
      skip: (req) => req.path === '/api/v1/health',
    })
  );

  // Global API rate limit — OTP endpoints have their own stricter limits
  // app.use(
  //   '/api/',
  //   rateLimit({
  //     windowMs: 15 * 60 * 1000,
  //     max: 5,
  //     standardHeaders: true,
  //     legacyHeaders: false,
  //     message: {
  //       success: false,
  //       error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests' },
  //     },
  //   })
  // );

  app.use('/api/v1/orders/webhooks/paystack', express.raw({ type: 'application/json' }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Trust proxy headers — required when behind nginx
  app.set('trust proxy', 1);

  // Routes (includes multer upload middleware on specific endpoints)
  app.use('/api/v1', routes);

  app.use((err: Error & { code?: string }, _req: Request, _res: Response, next: NextFunction) => {
    const isMulterLimit = typeof err.code === 'string' && err.code.startsWith('LIMIT_');
    const isTypeRejection = err.message.includes('Only JPEG') || err.message.includes('WebP');

    if (isMulterLimit || isTypeRejection) {
      return next(new ValidationError(err.message, { file: [err.message] }));
    }
    next(err);
  });

  // Catch-all 404
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  // Central error handler — must be last
  app.use(errorHandler);

  return app;
}
