import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { registerUser, loginUser, getMe, requestPasswordReset, resetPassword } from "./auth.service";
import { unauthorized } from "../../utils/errors";

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await registerUser(req.body);
  res.status(201).json(result);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await loginUser(req.body);
  res.status(200).json(result);
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  // Stateless JWT: the client discards the token.
  res.status(200).json({ success: true });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const result = await getMe(req.auth.userId);
  res.status(200).json(result);
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ data: await requestPasswordReset(req.body.email) });
});

export const resetPasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ data: await resetPassword(req.body.token, req.body.password) });
});
