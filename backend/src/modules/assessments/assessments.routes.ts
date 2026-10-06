import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { createAssessmentSchema, submitAttemptSchema } from "./assessments.validators";
import * as controller from "./assessments.controller";

const router = Router();

router.get("/", requireAuth, controller.listAssessments);
router.get("/:id", requireAuth, controller.getAssessmentById);
router.post(
  "/",
  requireAuth,
  requireRole("PLACEMENT_OFFICER", "ADMIN"),
  validateBody(createAssessmentSchema),
  controller.createAssessment
);

router.post("/:id/attempts", requireAuth, requireRole("STUDENT"), controller.startAttempt);
router.post(
  "/:id/attempts/:attemptId/submit",
  requireAuth,
  requireRole("STUDENT"),
  validateBody(submitAttemptSchema),
  controller.submitAttempt
);
router.get("/:id/attempts", requireAuth, controller.listAttempts);

export default router;
