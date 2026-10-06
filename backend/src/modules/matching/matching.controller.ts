import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import * as matchingService from "./matching.service";
import { runAutoShortlist } from "../applications/auto-shortlist";

export const runMatchingForJob = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const { candidates, screening } = await matchingService.computeCandidatesForJob(
    req.params.jobId,
    req.auth.userId,
    req.auth.role
  );
  // Fresh scores may now clear the job's auto-shortlist threshold.
  const { shortlisted } = await runAutoShortlist(req.params.jobId);
  res.status(200).json({
    data: { jobId: req.params.jobId, count: candidates.length, candidates, screening, autoShortlisted: shortlisted },
  });
});

export const getCandidatesForJob = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const { candidates, screening } = await matchingService.computeCandidatesForJob(
    req.params.jobId,
    req.auth.userId,
    req.auth.role
  );
  res.status(200).json({ data: { jobId: req.params.jobId, count: candidates.length, candidates, screening } });
});

export const getRecommendedJobs = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const jobs = await matchingService.getRecommendedJobsForStudent(req.auth.userId, {
    includeIneligible: req.query.include === "all",
  });
  res.status(200).json({ data: jobs });
});
