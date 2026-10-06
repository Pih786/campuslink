import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { createApplicationSchema, updateApplicationSchema } from "./applications.validators";
import * as controller from "./applications.controller";

const router = Router();

router.post(
  "/",
  requireAuth,
  requireRole("STUDENT"),
  validateBody(createApplicationSchema),
  controller.createApplication
);
router.get("/", requireAuth, controller.listApplications);
router.patch(
  "/:id",
  requireAuth,
  requireRole("RECRUITER", "PLACEMENT_OFFICER", "ADMIN"),
  validateBody(updateApplicationSchema),
  controller.updateApplication
);

export default router;
