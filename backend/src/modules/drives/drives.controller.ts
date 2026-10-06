import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import * as drivesService from "./drives.service";
import { resolveScope } from "../../utils/tenancy";

export const createDrive = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const drive = await drivesService.createDrive(req.body, req.auth.userId, req.auth.role);
  res.status(201).json({ data: drive });
});

export const getDriveById = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  await drivesService.assertDriveAccess(req.params.id, req.auth.userId, req.auth.role);
  const drive = await drivesService.getDriveById(req.params.id);
  res.status(200).json({ data: drive });
});

export const listDrives = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const result = await drivesService.listDrives(req, req.auth.userId, req.auth.role);
  res.status(200).json(result);
});

export const getDriveConflicts = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  await drivesService.assertDriveAccess(req.params.id, req.auth.userId, req.auth.role);
  const result = await drivesService.getDriveConflicts(req.params.id);
  res.status(200).json({ data: result });
});

export const checkDrive = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const scope = await resolveScope(req.auth.userId, req.auth.role);
  const collegeId = await drivesService.driveCollegeFor(scope, req.body.collegeId);
  const result = await drivesService.checkDriveSchedule(req.body, collegeId);
  res.status(200).json({ data: result });
});
