import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { upsertCompanySchema } from "./companies.validators";
import * as controller from "./companies.controller";

const router = Router();

router.get("/", requireAuth, controller.listCompanies);
router.post(
  "/",
  requireAuth,
  requireRole("RECRUITER", "PLACEMENT_OFFICER", "ADMIN"),
  validateBody(upsertCompanySchema),
  controller.upsertCompany
);
router.get("/:id", requireAuth, controller.getCompanyById);

export default router;
