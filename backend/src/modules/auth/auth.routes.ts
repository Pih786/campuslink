import { Request, Router } from "express";
import { register, login, logout, me, forgotPassword, resetPasswordHandler } from "./auth.controller";
import { validateBody } from "../../middleware/validate";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "./auth.validators";
import { requireAuth } from "../../middleware/auth";
import { rateLimitByKey } from "../../middleware/rateLimit";

const router = Router();
const FIFTEEN_MINUTES = 15 * 60 * 1000;

const byIp = (req: Request) => `ip:${req.ip}`;
const byEmail = (req: Request) => `email:${String(req.body?.email ?? "").toLowerCase()}`;
const tooMany = "Too many attempts. Please wait a few minutes and try again.";

router.post("/register", rateLimitByKey(10, FIFTEEN_MINUTES, byIp, tooMany), validateBody(registerSchema), register);
router.post("/login", rateLimitByKey(20, FIFTEEN_MINUTES, byIp, tooMany), validateBody(loginSchema), login);
router.post("/logout", logout);
router.get("/me", requireAuth, me);
router.post(
  "/forgot-password",
  rateLimitByKey(10, FIFTEEN_MINUTES, byIp, tooMany),
  rateLimitByKey(3, FIFTEEN_MINUTES, byEmail, tooMany),
  validateBody(forgotPasswordSchema),
  forgotPassword
);
router.post("/reset-password", rateLimitByKey(10, FIFTEEN_MINUTES, byIp, tooMany), validateBody(resetPasswordSchema), resetPasswordHandler);

export default router;
