import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ApiError } from "../utils/errors";

// Central error handler. Every error response follows:
// { success: false, error: { code, message, [details/reasons] } }
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ApiError) {
    const body = {
      success: false,
      error: { code: err.code, message: err.message, ...(err.meta ?? {}) },
    };
    return res.status(err.statusCode).json(body);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({
        success: false,
        error: { code: "DUPLICATE_ENTRY", message: "A record with these details already exists" },
      });
    }
    if (err.code === "P2025") {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Record not found" },
      });
    }
  }

  // Prisma throws a generic error when it cannot reach the database at all
  // (e.g. no live Postgres in this sandbox). Surface it as a clean 503
  // instead of a stack trace / process crash.
  if (
    err instanceof Prisma.PrismaClientInitializationError ||
    (err instanceof Error && /Can't reach database server/i.test(err.message))
  ) {
    return res.status(503).json({
      success: false,
      error: { code: "DATABASE_UNAVAILABLE", message: "Database is currently unreachable" },
    });
  }

  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "Route not found" },
  });
}
