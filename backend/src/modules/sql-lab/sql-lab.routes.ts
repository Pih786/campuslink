import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { createSqlProblemSchema, runOrSubmitSqlSchema } from "./sql-lab.validators";
import * as controller from "./sql-lab.controller";

const router = Router();

router.get("/problems", requireAuth, controller.listProblems);
router.get("/problems/:id", requireAuth, controller.getProblemById);
router.post(
  "/problems",
  requireAuth,
  requireRole("PLACEMENT_OFFICER", "ADMIN"),
  validateBody(createSqlProblemSchema),
  controller.createProblem
);

router.post(
  "/problems/:id/run",
  requireAuth,
  requireRole("STUDENT"),
  validateBody(runOrSubmitSqlSchema),
  controller.runQuery
);
router.post(
  "/problems/:id/submit",
  requireAuth,
  requireRole("STUDENT"),
  validateBody(runOrSubmitSqlSchema),
  controller.submitQuery
);

router.get("/submissions", requireAuth, controller.listSubmissions);

export default router;
