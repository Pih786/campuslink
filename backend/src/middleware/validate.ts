import { NextFunction, Request, Response } from "express";
import { ZodTypeAny } from "zod";
import { badRequest } from "../utils/errors";

// Validates req.body against a zod schema. On success, replaces req.body
// with the parsed (and potentially coerced/defaulted) value.
export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(
        badRequest(
          "Validation failed",
          result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
        )
      );
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(
        badRequest(
          "Validation failed",
          result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
        )
      );
    }
    // Keep req.query untouched (Express getter-only in some versions) but
    // expose parsed data separately for handlers that want typed/coerced values.
    (req as unknown as { validatedQuery?: unknown }).validatedQuery = result.data;
    next();
  };
}
