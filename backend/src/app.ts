import express, { Request, Response } from "express";
import cors from "cors";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

import authRoutes from "./modules/auth/auth.routes";
import studentsRoutes from "./modules/students/students.routes";
import companiesRoutes from "./modules/companies/companies.routes";
import jobsRoutes from "./modules/jobs/jobs.routes";
import applicationsRoutes from "./modules/applications/applications.routes";
import matchingRoutes from "./modules/matching/matching.routes";
import drivesRoutes from "./modules/drives/drives.routes";
import interviewsRoutes from "./modules/interviews/interviews.routes";
import offersRoutes from "./modules/offers/offers.routes";
import analyticsRoutes from "./modules/analytics/analytics.routes";
import skillsRoutes from "./modules/skills/skills.routes";
import codingRoutes from "./modules/coding/coding.routes";
import sqlLabRoutes from "./modules/sql-lab/sql-lab.routes";
import assessmentsRoutes from "./modules/assessments/assessments.routes";
import aiRoutes from "./modules/ai/ai.routes";
import copilotRoutes from "./modules/copilot/copilot.routes";
import notificationsRoutes from "./modules/notifications/notifications.routes";
import collegesRoutes from "./modules/colleges/colleges.routes";
import cvRoutes from "./modules/cv/cv.routes";
import learningRoutes from "./modules/learning/learning.routes";
import mentoringRoutes from "./modules/mentoring/mentoring.routes";
import assignmentsRoutes from "./modules/assignments/assignments.routes";
import predictiveRoutes from "./modules/predictive/predictive.routes";
import mockInterviewsRoutes from "./modules/mock-interviews/mock-interviews.routes";

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  const v1 = express.Router();
  v1.use("/auth", authRoutes);
  v1.use("/students", studentsRoutes);
  v1.use("/companies", companiesRoutes);
  v1.use("/jobs", jobsRoutes);
  v1.use("/applications", applicationsRoutes);
  v1.use("/matching", matchingRoutes);
  v1.use("/drives", drivesRoutes);
  v1.use("/interviews", interviewsRoutes);
  v1.use("/offers", offersRoutes);
  v1.use("/analytics", analyticsRoutes);
  v1.use("/skills", skillsRoutes);
  v1.use("/coding", codingRoutes);
  v1.use("/sql", sqlLabRoutes);
  v1.use("/assessments", assessmentsRoutes);
  v1.use("/ai", aiRoutes);
  v1.use("/copilot", copilotRoutes);
  v1.use("/notifications", notificationsRoutes);
  v1.use("/colleges", collegesRoutes);
  v1.use("/cv", cvRoutes);
  v1.use("/learning", learningRoutes);
  v1.use("/mentoring", mentoringRoutes);
  v1.use("/assignments", assignmentsRoutes);
  v1.use("/predictive", predictiveRoutes);
  v1.use("/mock-interviews", mockInterviewsRoutes);

  app.use("/api/v1", v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
