import { Request, Response } from "express";
import { ApplicationStatus } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import * as applicationsService from "./applications.service";

export const createApplication = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const application = await applicationsService.createApplication(req.auth.userId, req.body.jobId);
  res.status(201).json({ data: application });
});

export const listApplications = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const result = await applicationsService.listApplications(req, req.auth.userId, req.auth.role, {
    jobId: req.query.jobId as string | undefined,
    status: req.query.status as ApplicationStatus | undefined,
  });
  res.status(200).json(result);
});

export const updateApplication = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const application = await applicationsService.updateApplicationStatus(
    req.params.id,
    req.auth.userId,
    req.auth.role,
    req.body.status
  );
  res.status(200).json({ data: application });
});
