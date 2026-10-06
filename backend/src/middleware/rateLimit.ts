import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/errors";

// In-memory, per-user sliding window. Good enough for a single-instance
// deployment; protects paid LLM quota from accidental or scripted spam.
export function rateLimitPerUser(maxRequests: number, windowMs: number) {
  const hits = new Map<string, number[]>();

  return (req: Request, _res: Response, next: NextFunction) => {
    const key = req.auth?.userId ?? req.ip ?? "anonymous";
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

    if (recent.length >= maxRequests) {
      const retryAfterSeconds = Math.ceil((windowMs - (now - recent[0])) / 1000);
      return next(
        new ApiError(429, "RATE_LIMITED", "Too many AI requests — please wait a moment and try again", {
          retryAfterSeconds,
        })
      );
    }

    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

// Sliding window keyed by any request property (e.g. IP + submitted email),
// for unauthenticated endpoints such as password reset.
export function rateLimitByKey(maxRequests: number, windowMs: number, keyFn: (req: Request) => string, message: string) {
  const hits = new Map<string, number[]>();

  return (req: Request, _res: Response, next: NextFunction) => {
    const key = keyFn(req);
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= maxRequests) {
      const retryAfterSeconds = Math.ceil((windowMs - (now - recent[0])) / 1000);
      return next(new ApiError(429, "RATE_LIMITED", message, { retryAfterSeconds }));
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10000) {
      for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k);
    }
    next();
  };
}
