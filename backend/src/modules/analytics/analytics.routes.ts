import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as controller from "./analytics.controller";

const router = Router();

// STUDENT gets an own-only summary from the service layer; other roles get
// global/company-scoped counts. Role gating for "no access" cases (e.g.
// STUDENT hitting /funnel) is enforced inside the service.
router.get("/overview", requireAuth, controller.getOverview);
router.get("/funnel", requireAuth, controller.getFunnel);
router.get("/insights", requireAuth, requireRole("PLACEMENT_OFFICER", "ADMIN"), controller.getInsights);
router.post(
  "/at-risk/:studentId/nudge",
  requireAuth,
  requireRole("PLACEMENT_OFFICER", "ADMIN"),
  controller.nudgeStudent
);

export default router;
