import { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import { verifyToken, JwtPayload } from "../utils/jwt";
import { unauthorized, forbidden } from "../utils/errors";
import { isTokenCurrent } from "../utils/session";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next(unauthorized("Missing or invalid Authorization header"));
  }

  const token = header.slice("Bearer ".length);
  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
  } catch {
    return next(unauthorized("Invalid or expired token"));
  }
  isTokenCurrent(payload.userId, payload.iat)
    .then((current) => {
      if (!current) return next(unauthorized("Your password was changed. Please log in again."));
      req.auth = payload;
      next();
    })
    .catch(next);
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(unauthorized());
    }
    if (!roles.includes(req.auth.role)) {
      return next(forbidden("Your role does not have access to this resource"));
    }
    next();
  };
}
