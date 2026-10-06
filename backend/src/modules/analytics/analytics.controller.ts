import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import * as analyticsService from "./analytics.service";
import * as insightsService from "./insights.service";
import { resolveScope } from "../../utils/tenancy";

export const getOverview = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const result = await analyticsService.getOverview(req.auth.userId, req.auth.role);
  res.status(200).json({ data: result });
});

export const getFunnel = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const result = await analyticsService.getFunnel(req.auth.userId, req.auth.role);
  res.status(200).json({ data: result });
});

export const getInsights = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const scope = await resolveScope(req.auth.userId, req.auth.role);
  res.status(200).json({
    data: await insightsService.getPlacementInsights(scope.isAdmin ? null : scope.collegeId, {
      fresh: req.query.fresh === "true",
    }),
  });
});

export const nudgeStudent = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const scope = await resolveScope(req.auth.userId, req.auth.role);
  res.status(200).json({
    data: await insightsService.nudgeStudent(req.params.studentId, scope.isAdmin ? null : scope.collegeId),
  });
});
