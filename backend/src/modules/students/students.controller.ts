import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized, badRequest } from "../../utils/errors";
import { getSkillPassport } from "../skill-evidence/skill-evidence.service";
import * as studentsService from "./students.service";

export const getMyProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const student = await studentsService.getStudentByUserId(req.auth.userId);
  res.status(200).json({ data: student });
});

export const updateMyProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const student = await studentsService.updateMyProfile(req.auth.userId, req.body);
  res.status(200).json({ data: student });
});

export const getStudentById = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const student = await studentsService.getStudentById(req.params.id, req.auth.userId, req.auth.role);
  res.status(200).json({ data: student });
});

export const listStudents = asyncHandler(async (req: Request, res: Response) => {
  const minCgpaRaw = req.query.minCgpa ?? req.query.cgpa;
  if (!req.auth) throw unauthorized();
  const result = await studentsService.listStudents(req, req.auth.userId, req.auth.role, {
    branch: req.query.branch as string | undefined,
    minCgpa: minCgpaRaw !== undefined ? parseFloat(minCgpaRaw as string) : undefined,
    skill: req.query.skill as string | undefined,
  });
  res.status(200).json(result);
});

export const addSkill = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const { skillName, proficiency } = req.body;
  const result = await studentsService.addOrUpdateSkill(req.auth.userId, skillName, proficiency);
  res.status(200).json({ data: result });
});

export const uploadResume = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  if (!req.file) throw badRequest("resume file is required (field name: resume)");
  const result = await studentsService.saveResume(req.auth.userId, req.file);
  res.status(200).json(result);
});

export const getResume = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const result = await studentsService.getResume(req.auth.userId);
  res.status(200).json(result);
});

export const getSkillGaps = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const jobId = req.query.jobId as string | undefined;
  const result = await studentsService.getSkillGaps(req.auth.userId, jobId);
  res.status(200).json({ data: result });
});

export const getReadiness = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const role = req.query.role as string | undefined;
  const result = await studentsService.getReadiness(req.auth.userId, role);
  res.status(200).json({ data: result });
});

export const getSkillPassportForMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const student = await studentsService.getStudentByUserId(req.auth.userId);
  const result = await getSkillPassport(student.id);
  res.status(200).json({ data: result });
});

export const addProject = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  res.status(201).json({ data: await studentsService.addProject(req.auth.userId, req.body) });
});

export const deleteProject = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  res.status(200).json({ data: await studentsService.deleteProject(req.auth.userId, req.params.projectId) });
});

export const addCertification = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  res.status(201).json({ data: await studentsService.addCertification(req.auth.userId, req.body) });
});

export const deleteCertification = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  res.status(200).json({ data: await studentsService.deleteCertification(req.auth.userId, req.params.certificationId) });
});

export const downloadMyResume = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const { fullPath, fileName } = await studentsService.resumeFile(null, req.auth.userId, req.auth.role);
  res.setHeader("Cache-Control", "private, no-store");
  res.download(fullPath, fileName);
});

export const downloadStudentResume = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const { fullPath, fileName } = await studentsService.resumeFile(req.params.id, req.auth.userId, req.auth.role);
  res.setHeader("Cache-Control", "private, no-store");
  res.download(fullPath, fileName);
});
