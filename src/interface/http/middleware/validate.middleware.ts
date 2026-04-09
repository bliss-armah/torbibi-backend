import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

type RequestPart = 'body' | 'query' | 'params';

/**
 * Returns a middleware that validates a specific part of the request
 * using a Zod schema. On success, replaces the original data with the
 * parsed (and coerced) result. On failure, forwards the ZodError to
 * the error handler.
 */
export function validate(schema: ZodSchema, part: RequestPart = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      next(result.error);
      return;
    }
    // Replace with parsed data so controllers receive typed, validated input
    (req as unknown as Record<string, unknown>)[part] = result.data;
    next();
  };
}
