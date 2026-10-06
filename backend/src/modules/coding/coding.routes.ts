import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { createCodingProblemSchema, runOrSubmitCodeSchema } from "./coding.validators";
import * as controller from "./coding.controller";

const router = Router();

router.get("/problems", requireAuth, controller.listProblems);
router.get("/problems/:id", requireAuth, controller.getProblemById);
router.post(
  "/problems",
  requireAuth,
  requireRole("PLACEMENT_OFFICER", "ADMIN"),
  validateBody(createCodingProblemSchema),
  controller.createProblem
);

router.post(
  "/problems/:id/run",
  requireAuth,
  requireRole("STUDENT"),
  validateBody(runOrSubmitCodeSchema),
  controller.runCode
);
router.post(
  "/problems/:id/submit",
  requireAuth,
  requireRole("STUDENT"),
  validateBody(runOrSubmitCodeSchema),
  controller.submitCode
);

router.get("/submissions", requireAuth, controller.listSubmissions);

export default router;
