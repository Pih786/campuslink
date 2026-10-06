import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import * as companiesService from "./companies.service";

export const listCompanies = asyncHandler(async (req: Request, res: Response) => {
  const result = await companiesService.listCompanies(req);
  res.status(200).json(result);
});

export const getCompanyById = asyncHandler(async (req: Request, res: Response) => {
  const company = await companiesService.getCompanyById(req.params.id);
  res.status(200).json({ data: company });
});

export const upsertCompany = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const company = await companiesService.upsertCompanyProfile(
    req.auth.userId,
    req.auth.role,
    req.body
  );
  res.status(201).json({ data: company });
});
