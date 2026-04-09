import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ValidationError } from '../../../shared/errors';
import { logger } from '../../../shared/utils/logger';

/**
 * Central error handler — the last middleware in the Express chain.
 * Converts all error types to a consistent JSON response format.
 * Operational errors are safe to surface; unexpected errors return a generic message.
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Zod validation errors from request parsing
  if (error instanceof ZodError) {
    const details: Record<string, string[]> = {};
    error.errors.forEach((e) => {
      const path = e.path.join('.');
      details[path] = details[path] ?? [];
      details[path].push(e.message);
    });

    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details,
      },
    });
    return;
  }

  // Known operational errors
  if (error instanceof AppError) {
    if (!error.isOperational) {
      logger.error('Unexpected operational error', {
        message: error.message,
        stack: error.stack,
        path: req.path,
      });
    }

    const body: Record<string, unknown> = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    };

    if (error instanceof ValidationError) {
      (body.error as Record<string, unknown>).details = error.details;
    }

    res.status(error.statusCode).json(body);
    return;
  }

  // Truly unexpected errors — don't leak internals
  logger.error('Unhandled error', {
    message: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}

/**
 * Wraps async route handlers to forward errors to the error middleware.
 * Eliminates try/catch boilerplate in every controller.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
