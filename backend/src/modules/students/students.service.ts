import { prisma } from "../../config/prisma";
import { ApiError, forbidden, notFound } from "../../utils/errors";
import { findOrCreateSkill } from "../skills/skills.service";
import { UpdateStudentInput } from "./students.validators";
import { getPagination, paginatedResponse } from "../../utils/pagination";
import { Request } from "express";
import {
  aiAnalyzeResume,
  AiResumeAnalysis,
  aiReadiness,
  AiStudentSkill,
} from "../../utils/ai-client";
import fs from "fs";
import path from "path";
import { Prisma, Role } from "@prisma/client";
import { extractResumeText } from "../../utils/resume-text";
import { jobsVisibleToCollege, resolveScope, studentsInScope } from "../../utils/tenancy";
import { privateResumeDir } from "../../utils/upload";

const studentInclude = {
  user: { select: { id: true, email: true, fullName: true } },
  college: true,
  educations: true,
  skills: { include: { skill: true } },
  projects: { orderBy: { createdAt: "desc" } },
  certifications: { orderBy: { createdAt: "desc" } },
} as const;

export async function getStudentByUserId(userId: string) {
  const student = await prisma.student.findUnique({
    where: { userId },
    include: studentInclude,
  });
  if (!student) throw notFound("Student profile");
  return student;
}

export async function getStudentById(id: string, userId: string, role: Role) {
  const scope = await resolveScope(userId, role);
  const student = await prisma.student.findFirst({
    where: { id, ...studentsInScope(scope) },
    include: studentInclude,
  });
  if (!student) throw notFound("Student");
  return student;
}

// Mirrors the "Next steps" checklist on the student dashboard.
export const MIN_PROFILE_SKILLS = 3;

function computeProfileCompletion(student: {
  department: string | null;
  cgpa: number;
  graduationYear: number | null;
  phone: string | null;
  resumeUrl: string | null;
  skills: unknown[];
  projects: unknown[];
}): number {
  const checks = [
    !!student.department,
    student.cgpa > 0 && !!student.graduationYear,
    !!student.phone,
    !!student.resumeUrl,
    student.skills.length >= MIN_PROFILE_SKILLS,
    student.projects.length > 0,
  ];
  const passed = checks.filter(Boolean).length;
  return Math.round((passed / checks.length) * 100);
}

export async function recomputeCompletion(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { skills: { select: { id: true } }, projects: { select: { id: true } } },
  });
  if (!student) return;
  const completion = computeProfileCompletion(student);
  if (completion !== student.profileCompletion) {
    await prisma.student.update({ where: { id: studentId }, data: { profileCompletion: completion } });
  }
}

export async function updateMyProfile(userId: string, input: UpdateStudentInput) {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw notFound("Student profile");

  let collegeId = student.collegeId;
  if (input.collegeName) {
    const college = await prisma.college.upsert({
      where: { name: input.collegeName },
      update: {},
      create: { name: input.collegeName },
    });
    collegeId = college.id;
  }

  if (input.fullName) {
    await prisma.user.update({ where: { id: userId }, data: { fullName: input.fullName } });
  }

  const updated = await prisma.student.update({
    where: { userId },
    data: {
      phone: input.phone,
      department: input.department,
      graduationYear: input.graduationYear,
      cgpa: input.cgpa,
      backlogCount: input.backlogCount,
      studentCode: input.studentCode,
      collegeId,
    },
    include: studentInclude,
  });

  const completion = computeProfileCompletion(updated);
  const withCompletion = await prisma.student.update({
    where: { userId },
    data: { profileCompletion: completion },
    include: studentInclude,
  });

  return withCompletion;
}

export async function addOrUpdateSkill(userId: string, skillName: string, proficiency: number) {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw notFound("Student profile");

  const skill = await findOrCreateSkill(skillName);

  const studentSkill = await prisma.studentSkill.upsert({
    where: { studentId_skillId: { studentId: student.id, skillId: skill.id } },
    update: { proficiency, source: "SELF_DECLARED" },
    create: {
      studentId: student.id,
      skillId: skill.id,
      proficiency,
      source: "SELF_DECLARED",
    },
    include: { skill: true },
  });

  await recomputeCompletion(student.id);
  return studentSkill;
}

interface ListStudentsFilters {
  branch?: string;
  minCgpa?: number;
  skill?: string;
}

export async function listStudents(req: Request, userId: string, role: Role, filters: ListStudentsFilters) {
  const pagination = getPagination(req);
  const scope = await resolveScope(userId, role);

  const where: Prisma.StudentWhereInput = { ...studentsInScope(scope) };
  if (filters.branch) {
    where.department = { equals: filters.branch, mode: "insensitive" };
  }
  if (filters.minCgpa !== undefined && !Number.isNaN(filters.minCgpa)) {
    where.cgpa = { gte: filters.minCgpa };
  }
  if (filters.skill) {
    where.skills = {
      some: { skill: { name: { equals: filters.skill, mode: "insensitive" } } },
    };
  }

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      include: studentInclude,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.student.count({ where }),
  ]);

  return paginatedResponse(students, total, pagination);
}

// ------------------------------------------------------------------
// Resume upload
// ------------------------------------------------------------------

// `known` is passed when the resume was generated from structured data (the
// CV maker), so there is nothing to guess: it is synced instead of parsed.
export async function saveResume(
  userId: string,
  file: Express.Multer.File,
  known?: Pick<AiResumeAnalysis, "skills" | "projects" | "certifications">
) {
  const student = await prisma.student.findUnique({
    where: { userId },
    include: { projects: true, certifications: true },
  });
  if (!student) throw notFound("Student profile");

  // Stored as a bare file name inside the private resume folder.
  const resumeUrl = file.filename;
  const previous = student.resumeUrl;
  const summary = { textExtracted: false, skillsAdded: 0, projectsAdded: 0, certificationsAdded: 0, aiUnavailable: false };

  try {
    const text = known ? null : await extractResumeText(file.path, file.originalname);
    if (known || text) {
      summary.textExtracted = true;
      const analysis = known ?? (await aiAnalyzeResume(text!));
      summary.aiUnavailable = !known && Boolean((analysis as AiResumeAnalysis).aiUnavailable);

      for (const skillName of analysis.skills) {
        const skill = await findOrCreateSkill(skillName);
        const existing = await prisma.studentSkill.findUnique({
          where: { studentId_skillId: { studentId: student.id, skillId: skill.id } },
        });
        // Never overwrite a level the student set or earned; resume-only skills start at 2.
        if (!existing) {
          await prisma.studentSkill.create({
            data: { studentId: student.id, skillId: skill.id, proficiency: 2, source: "RESUME" },
          });
          summary.skillsAdded++;
        }
      }

      const knownProjects = new Set(student.projects.map((p) => p.title.trim().toLowerCase()));
      for (const project of analysis.projects ?? []) {
        const title = project.title?.trim().slice(0, 120);
        if (!title || knownProjects.has(title.toLowerCase())) continue;
        knownProjects.add(title.toLowerCase());
        await prisma.studentProject.create({
          data: { studentId: student.id, title, techStack: (project.technologies ?? []).slice(0, 15) },
        });
        summary.projectsAdded++;
      }

      const knownCerts = new Set(student.certifications.map((c) => c.name.trim().toLowerCase()));
      for (const name of analysis.certifications ?? []) {
        const clean = name?.trim().slice(0, 160);
        if (!clean || knownCerts.has(clean.toLowerCase())) continue;
        knownCerts.add(clean.toLowerCase());
        await prisma.studentCertification.create({ data: { studentId: student.id, name: clean } });
        summary.certificationsAdded++;
      }
    }
  } catch (err) {
    // Best effort: a parsing failure must never fail the upload itself.
    console.error("[resume] extraction failed", err);
  }

  await prisma.student.update({ where: { userId }, data: { resumeUrl } });
  await recomputeCompletion(student.id);
  if (previous && previous !== resumeUrl) {
    fs.promises.unlink(path.join(privateResumeDir, path.basename(previous))).catch(() => undefined);
  }

  return { resumeUrl, extracted: summary };
}

// ------------------------------------------------------------------
// Projects and certifications
// ------------------------------------------------------------------

async function studentIdFor(userId: string) {
  const student = await prisma.student.findUnique({ where: { userId }, select: { id: true } });
  if (!student) throw notFound("Student profile");
  return student.id;
}

export async function addProject(
  userId: string,
  input: { title: string; description?: string; techStack?: string[]; url?: string }
) {
  const studentId = await studentIdFor(userId);
  const project = await prisma.studentProject.create({
    data: {
      studentId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      techStack: [...new Set((input.techStack ?? []).map((t) => t.trim()).filter(Boolean))].slice(0, 15),
      url: input.url?.trim() || null,
    },
  });
  await recomputeCompletion(studentId);
  return project;
}

export async function deleteProject(userId: string, projectId: string) {
  const studentId = await studentIdFor(userId);
  const result = await prisma.studentProject.deleteMany({ where: { id: projectId, studentId } });
  if (result.count === 0) throw notFound("Project");
  await recomputeCompletion(studentId);
  return { deleted: true };
}

export async function addCertification(
  userId: string,
  input: { name: string; issuer?: string; issuedAt?: string; url?: string }
) {
  const studentId = await studentIdFor(userId);
  const certification = await prisma.studentCertification.create({
    data: {
      studentId,
      name: input.name.trim(),
      issuer: input.issuer?.trim() || null,
      issuedAt: input.issuedAt ? new Date(input.issuedAt) : null,
      url: input.url?.trim() || null,
    },
  });
  await recomputeCompletion(studentId);
  return certification;
}

export async function deleteCertification(userId: string, certificationId: string) {
  const studentId = await studentIdFor(userId);
  const result = await prisma.studentCertification.deleteMany({ where: { id: certificationId, studentId } });
  if (result.count === 0) throw notFound("Certification");
  await recomputeCompletion(studentId);
  return { deleted: true };
}

export async function getResume(userId: string) {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student || !student.resumeUrl) {
    throw new ApiError(404, "NOT_FOUND", "No resume uploaded yet");
  }
  return { resumeUrl: student.resumeUrl };
}

// Students read their own resume; officers read any; recruiters only
// read resumes of students who applied to one of their company's roles.
export async function resumeFile(studentId: string | null, userId: string, role: Role) {
  const student = studentId
    ? await prisma.student.findUnique({ where: { id: studentId }, include: { user: true } })
    : await prisma.student.findUnique({ where: { userId }, include: { user: true } });
  if (!student) throw notFound("Student");

  if (role === "STUDENT" && student.userId !== userId) throw forbidden("You can only open your own resume");
  if (role === "PLACEMENT_OFFICER" || role === "MENTOR") {
    const scope = await resolveScope(userId, role);
    if (scope.collegeId !== student.collegeId) throw forbidden("This student belongs to another college");
  }
  if (role === "RECRUITER") {
    const recruiter = await prisma.recruiter.findUnique({ where: { userId } });
    const applied = recruiter
      ? await prisma.application.count({ where: { studentId: student.id, job: { companyId: recruiter.companyId } } })
      : 0;
    if (!applied) throw forbidden("Resumes are shared once a student applies to one of your roles");
  }

  if (!student.resumeUrl) throw notFound("Resume");
  const fullPath = path.join(privateResumeDir, path.basename(student.resumeUrl));
  if (!fs.existsSync(fullPath)) throw notFound("Resume file");
  const ext = path.extname(fullPath);
  const safeName = student.user.fullName.replace(/[^\w .-]/g, "").trim() || "student";
  return { fullPath, fileName: `${safeName} resume${ext}` };
}

// ------------------------------------------------------------------
// Skill gaps / readiness (AI-backed, with graceful fallback baked
// into the ai-client itself)
// ------------------------------------------------------------------

export async function getSkillGaps(userId: string, jobId?: string) {
  const student = await getStudentByUserId(userId);

  let targetJobId = jobId;

  if (!targetJobId) {
    const topApplication = await prisma.application.findFirst({
      where: { studentId: student.id, matchScore: { not: null } },
      orderBy: [{ matchScore: "desc" }, { updatedAt: "desc" }],
    });
    targetJobId = topApplication?.jobId;
  }

  if (!targetJobId) {
    return { jobId: null, matched: [], missing: [], aiUnavailable: false };
  }

  const job = await prisma.job.findFirst({
    where: { id: targetJobId, ...jobsVisibleToCollege(student.collegeId) },
    include: { requirements: { include: { skill: true } } },
  });
  if (!job) throw notFound("Job");

  // Same rule as the eligibility engine (same skill, at the required level),
  // so this page can never say "covered" while eligibility says "missing".
  const level = new Map(student.skills.map((k) => [k.skillId, k.proficiency]));
  const matched: string[] = [];
  const missing: string[] = [];
  const weak: { name: string; have: number; need: number }[] = [];
  for (const r of job.requirements) {
    if (r.requirementType !== "SKILL" || !r.skill) continue;
    const have = level.get(r.skill.id) ?? 0;
    const need = r.minimumProficiency ?? 1;
    if (have >= need) matched.push(r.skill.name);
    else {
      missing.push(r.skill.name);
      if (have > 0) weak.push({ name: r.skill.name, have, need });
    }
  }
  return { jobId: job.id, matched, missing, weak, aiUnavailable: false };
}

export interface RoleReadiness {
  role: string;
  jobIds: string[];
  score: number;
  band: string;
  requiredSkillCount: number;
  matched: string[];
  weak: { name: string; have: number; need: number }[];
  missing: string[];
  aiUnavailable: boolean;
}

interface RoleGroup {
  titles: Map<string, number>;
  jobIds: string[];
  skills: Map<string, { name: string; need: number }>;
}

// Readiness is role-specific (TRD §31): published jobs are grouped by
// title, and each role is scored against the union of its skill requirements.
export async function getReadiness(userId: string, roleQuery?: string): Promise<{ roles: RoleReadiness[] }> {
  const student = await getStudentByUserId(userId);
  const studentSkills: AiStudentSkill[] = student.skills.map((s) => ({
    name: s.skill.name,
    proficiency: s.proficiency,
    verified: s.verified,
  }));
  const proficiencyBySkillId = new Map(student.skills.map((s) => [s.skillId, s.proficiency]));

  const jobs = await prisma.job.findMany({
    where: {
      status: "PUBLISHED",
      ...jobsVisibleToCollege(student.collegeId),
      ...(roleQuery ? { title: { contains: roleQuery, mode: "insensitive" as const } } : {}),
    },
    include: { requirements: { include: { skill: true } } },
  });

  const groups = new Map<string, RoleGroup>();
  for (const job of jobs) {
    const title = job.title.trim().replace(/\s+/g, " ");
    const key = title.toLowerCase();
    const group: RoleGroup = groups.get(key) ?? { titles: new Map(), jobIds: [], skills: new Map() };
    group.titles.set(title, (group.titles.get(title) ?? 0) + 1);
    group.jobIds.push(job.id);
    for (const req of job.requirements) {
      if (req.requirementType !== "SKILL" || !req.skill) continue;
      const need = req.minimumProficiency ?? 1;
      const existing = group.skills.get(req.skill.id);
      group.skills.set(req.skill.id, { name: req.skill.name, need: Math.max(existing?.need ?? 0, need) });
    }
    groups.set(key, group);
  }

  const roles = await Promise.all(
    [...groups.values()]
      .filter((g) => g.skills.size > 0)
      .map(async (group): Promise<RoleReadiness> => {
        const required = [...group.skills.entries()];
        const result = await aiReadiness(studentSkills, required.map(([, s]) => s.name));

        const matched: string[] = [];
        const weak: RoleReadiness["weak"] = [];
        const missing: string[] = [];
        for (const [skillId, { name, need }] of required) {
          const have = proficiencyBySkillId.get(skillId);
          if (have == null) missing.push(name);
          else if (have < need) weak.push({ name, have, need });
          else matched.push(name);
        }

        const role = [...group.titles.entries()].sort((a, b) => b[1] - a[1])[0][0];
        return {
          role,
          jobIds: group.jobIds,
          score: result.score,
          band: result.band,
          requiredSkillCount: required.length,
          matched,
          weak,
          missing,
          aiUnavailable: Boolean(result.aiUnavailable),
        };
      })
  );

  roles.sort((a, b) => b.score - a.score || a.role.localeCompare(b.role));
  return { roles };
}
