import { Request } from "express";
import { prisma } from "../../config/prisma";
import { notFound } from "../../utils/errors";
import { getPagination, paginatedResponse } from "../../utils/pagination";
import { UpsertCompanyInput } from "./companies.validators";
import { Role } from "@prisma/client";

export async function listCompanies(req: Request) {
  const pagination = getPagination(req);
  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { name: "asc" },
    }),
    prisma.company.count(),
  ]);
  return paginatedResponse(companies, total, pagination);
}

export async function getCompanyById(id: string) {
  const company = await prisma.company.findUnique({
    where: { id },
    include: { jobs: true },
  });
  if (!company) throw notFound("Company");
  return company;
}

export async function upsertCompanyProfile(
  userId: string,
  role: Role,
  input: UpsertCompanyInput
) {
  if (role === "RECRUITER") {
    const recruiter = await prisma.recruiter.findUnique({ where: { userId } });
    if (!recruiter) throw notFound("Recruiter profile");
    return prisma.company.update({
      where: { id: recruiter.companyId },
      data: {
        name: input.name,
        industry: input.industry,
        website: input.website,
        location: input.location,
        status: input.status,
      },
    });
  }

  // PLACEMENT_OFFICER / ADMIN can create or update a company by name.
  return prisma.company.upsert({
    where: { name: input.name },
    update: {
      industry: input.industry,
      website: input.website,
      location: input.location,
      status: input.status,
    },
    create: {
      name: input.name,
      industry: input.industry,
      website: input.website,
      location: input.location,
      status: input.status,
    },
  });
}
