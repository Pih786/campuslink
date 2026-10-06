import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import * as predictiveService from "./predictive.service";

export const getPredictiveCandidates = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const data = await predictiveService.getPredictiveCandidates(req.params.jobId, req.auth.userId, req.auth.role);
  res.status(200).json({ data });
});

export const getModelInfo = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ data: await predictiveService.getModelInfo() });
});
