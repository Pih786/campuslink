export class ApiError extends Error {
  statusCode: number;
  code: string;
  // Extra fields merged directly into the `error` object of the response,
  // e.g. { reasons: [...] } for NOT_ELIGIBLE, or { details: [...] } for
  // validation errors. Kept generic so each call site controls the exact
  // shape without needing a new subclass per error type.
  meta?: Record<string, unknown>;

  constructor(statusCode: number, code: string, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.meta = meta;
  }
}

export function notFound(entity: string): ApiError {
  return new ApiError(404, "NOT_FOUND", `${entity} not found`);
}

export function forbidden(message = "You do not have access to this resource"): ApiError {
  return new ApiError(403, "FORBIDDEN", message);
}

export function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError(400, "BAD_REQUEST", message, details !== undefined ? { details } : undefined);
}

export function unauthorized(message = "Unauthorized"): ApiError {
  return new ApiError(401, "UNAUTHORIZED", message);
}

export function conflict(code: string, message: string): ApiError {
  return new ApiError(409, code, message);
}

export function notEligible(message: string, reasons: string[]): ApiError {
  return new ApiError(400, "NOT_ELIGIBLE", message, { reasons });
}
