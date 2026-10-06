import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import * as jobsService from "./jobs.service";

export const createJob = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const job = await jobsService.createJob(req.auth.userId, req.auth.role, req.body);
  res.status(201).json({ data: job });
});

export const getJobById = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const job = await jobsService.getJobById(req.params.id, req.auth.userId, req.auth.role);
  res.status(200).json({ data: job });
});

export const listJobs = asyncHandler(async (req: Request, res: Response) => {
  const result = await jobsService.listJobs(req, req.auth?.userId, req.auth?.role, {
    status: req.query.status as string | undefined,
    companyId: req.query.companyId as string | undefined,
    title: req.query.title as string | undefined,
  });
  res.status(200).json(result);
});

export const updateJob = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const job = await jobsService.updateJob(req.params.id, req.auth.userId, req.auth.role, req.body);
  res.status(200).json({ data: job });
});
