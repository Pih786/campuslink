import { LearningStatus, Prisma, ResourceType, Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { forbidden, notFound } from "../../utils/errors";
import { assertStudentInCollege, resolveScope, Scope } from "../../utils/tenancy";
import { aiTutor } from "../../utils/ai-client";
import { videosForSkill } from "../../utils/youtube";
import { findOrCreateSkill } from "../skills/skills.service";
import { getReadiness } from "../students/students.service";

const resourceInclude = {
  skill: { select: { id: true, name: true } },
} satisfies Prisma.LearningResourceInclude;

// Shared library items plus whatever the caller's own college has added.
function resourcesInScope(scope: Scope): Prisma.LearningResourceWhereInput {
  if (scope.isAdmin) return {};
  if (!scope.collegeId) return { collegeId: null };
  return { OR: [{ collegeId: null }, { collegeId: scope.collegeId }] };
}

function skillNamesFilter(names: string[]): Prisma.LearningResourceWhereInput {
  return { OR: names.map((name) => ({ skill: { name: { equals: name, mode: "insensitive" as const } } })) };
}

async function studentFor(userId: string) {
  const student = await prisma.student.findUnique({
    where: { userId },
    include: { skills: { include: { skill: true } } },
  });
  if (!student) throw notFound("Student profile");
  return student;
}

async function progressMap(studentId: string, resourceIds: string[]) {
  if (!resourceIds.length) return new Map<string, LearningStatus>();
  const rows = await prisma.learningProgress.findMany({
    where: { studentId, resourceId: { in: resourceIds } },
  });
  return new Map(rows.map((r) => [r.resourceId, r.status]));
}

// ------------------------------------------------------------------
// Library
// ------------------------------------------------------------------

export async function listResources(
  userId: string,
  role: Role,
  filters: { skill?: string; type?: ResourceType; q?: string }
) {
  const scope = await resolveScope(userId, role);
  const and: Prisma.LearningResourceWhereInput[] = [resourcesInScope(scope)];
  if (filters.skill) and.push(skillNamesFilter([filters.skill]));
  if (filters.type) and.push({ type: filters.type });
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { provider: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { skill: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  const resources = await prisma.learningResource.findMany({
    where: { AND: and },
    include: resourceInclude,
    orderBy: [{ skill: { name: "asc" } }, { level: "asc" }, { title: "asc" }],
    take: 200,
  });

  if (role !== "STUDENT") {
    return resources.map((r) => ({ ...r, canDelete: scope.isAdmin || (r.collegeId !== null && r.collegeId === scope.collegeId) }));
  }
  const student = await studentFor(userId);
  const progress = await progressMap(student.id, resources.map((r) => r.id));
  return resources.map((r) => ({ ...r, status: progress.get(r.id) ?? null, canDelete: false }));
}

export async function createResource(
  userId: string,
  role: Role,
  input: {
    skillName: string;
    title: string;
    url: string;
    type: ResourceType;
    provider?: string;
    level?: string;
    durationMinutes?: number;
    description?: string;
  }
) {
  const scope = await resolveScope(userId, role);
  const skill = await findOrCreateSkill(input.skillName);
  return prisma.learningResource.create({
    data: {
      skillId: skill.id,
      title: input.title.trim(),
      url: input.url.trim(),
      type: input.type,
      provider: input.provider?.trim() || null,
      level: input.level?.trim() || null,
      durationMinutes: input.durationMinutes ?? null,
      description: input.description?.trim() || null,
      // Admin additions are shared platform-wide; staff additions stay with their college.
      collegeId: scope.isAdmin ? null : scope.collegeId,
      createdById: userId,
    },
    include: resourceInclude,
  });
}

export async function deleteResource(userId: string, role: Role, id: string) {
  const scope = await resolveScope(userId, role);
  const resource = await prisma.learningResource.findUnique({ where: { id } });
  if (!resource) throw notFound("Resource");
  if (!scope.isAdmin && (resource.collegeId === null || resource.collegeId !== scope.collegeId)) {
    throw forbidden("Only the college that added this resource, or a platform admin, can remove it");
  }
  await prisma.learningResource.delete({ where: { id } });
  return { deleted: true };
}

// ------------------------------------------------------------------
// Student progress
// ------------------------------------------------------------------

export async function setProgress(userId: string, resourceId: string, status: LearningStatus | null) {
  const student = await studentFor(userId);
  const scope = await resolveScope(userId, "STUDENT");
  const resource = await prisma.learningResource.findFirst({ where: { id: resourceId, ...resourcesInScope(scope) } });
  if (!resource) throw notFound("Resource");

  if (status === null) {
    await prisma.learningProgress.deleteMany({ where: { studentId: student.id, resourceId } });
    return { resourceId, status: null };
  }
  const row = await prisma.learningProgress.upsert({
    where: { studentId_resourceId: { studentId: student.id, resourceId } },
    update: { status },
    create: { studentId: student.id, resourceId, status },
  });
  return { resourceId, status: row.status };
}

async function learningSummary(studentId: string) {
  const rows = await prisma.learningProgress.findMany({
    where: { studentId },
    include: { resource: { include: resourceInclude } },
    orderBy: { updatedAt: "desc" },
  });
  const counts = { SAVED: 0, IN_PROGRESS: 0, COMPLETED: 0 } as Record<LearningStatus, number>;
  for (const r of rows) counts[r.status]++;
  return {
    counts,
    items: rows.map((r) => ({ ...r.resource, status: r.status, updatedAt: r.updatedAt })),
  };
}

export async function myLearning(userId: string) {
  const student = await studentFor(userId);
  return learningSummary(student.id);
}

// Staff view of one student's learning (mentors and the placement office).
export async function studentLearning(userId: string, role: Role, studentId: string) {
  const scope = await resolveScope(userId, role);
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
  if (!student) throw notFound("Student");
  await assertStudentInCollege(scope, studentId);
  return learningSummary(studentId);
}

// ------------------------------------------------------------------
// "Improve my match" plan
// ------------------------------------------------------------------

const PLAN_SKILLS = 8;

interface GapSkill {
  name: string;
  status: "missing" | "weak";
  have: number;
  need: number;
  roles: string[];
}

// Turns role readiness into a ranked list of skills to work on: the skills
// needed by the most roles first, missing before weak.
export async function getPlan(userId: string) {
  const student = await studentFor(userId);
  const scope = await resolveScope(userId, "STUDENT");
  const { roles } = await getReadiness(userId);

  const gaps = new Map<string, GapSkill>();
  for (const role of roles) {
    for (const name of role.missing) {
      const key = name.toLowerCase();
      const entry = gaps.get(key) ?? { name, status: "missing" as const, have: 0, need: 0, roles: [] };
      entry.status = "missing";
      entry.roles.push(role.role);
      gaps.set(key, entry);
    }
    for (const weak of role.weak) {
      const key = weak.name.toLowerCase();
      const entry = gaps.get(key) ?? { name: weak.name, status: "weak" as const, have: weak.have, need: weak.need, roles: [] };
      entry.need = Math.max(entry.need, weak.need);
      entry.have = weak.have;
      entry.roles.push(role.role);
      gaps.set(key, entry);
    }
  }

  const ranked = [...gaps.values()]
    .map((g) => ({ ...g, roles: [...new Set(g.roles)] }))
    .sort(
      (a, b) =>
        b.roles.length - a.roles.length ||
        Number(b.status === "missing") - Number(a.status === "missing") ||
        a.name.localeCompare(b.name)
    )
    .slice(0, PLAN_SKILLS);

  const resources = ranked.length
    ? await prisma.learningResource.findMany({
        where: { AND: [resourcesInScope(scope), skillNamesFilter(ranked.map((g) => g.name))] },
        include: resourceInclude,
        orderBy: [{ level: "asc" }, { title: "asc" }],
      })
    : [];
  const progress = await progressMap(student.id, resources.map((r) => r.id));

  const skills = ranked.map((gap) => {
    const own = resources
      .filter((r) => r.skill?.name.toLowerCase() === gap.name.toLowerCase())
      .map((r) => ({ ...r, status: progress.get(r.id) ?? null }));
    return {
      ...gap,
      resources: own,
      completed: own.filter((r) => r.status === "COMPLETED").length,
    };
  });

  const summary = await learningSummary(student.id);
  return {
    skills,
    rolesConsidered: roles.length,
    counts: summary.counts,
  };
}

export async function skillVideos(skill: string, mode: "learn" | "improve") {
  return videosForSkill(skill, mode);
}

// ------------------------------------------------------------------
// AI tutor
// ------------------------------------------------------------------

const TUTOR_RESOURCES = 8;

export async function askTutor(
  userId: string,
  input: { question: string; skill?: string; history: { role: "user" | "assistant"; content: string }[] }
) {
  const student = await studentFor(userId);
  const scope = await resolveScope(userId, "STUDENT");

  // Ground the tutor on the skill in focus, or on any library skill the
  // question mentions by name.
  let skillNames: string[] = input.skill ? [input.skill] : [];
  if (!skillNames.length) {
    const librarySkills = await prisma.skill.findMany({
      where: { resources: { some: resourcesInScope(scope) } },
      select: { name: true },
    });
    const q = input.question.toLowerCase();
    skillNames = librarySkills
      .map((s) => s.name)
      .filter((name) => new RegExp(`(^|[^a-z0-9])${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(q));
  }

  const resources = skillNames.length
    ? await prisma.learningResource.findMany({
        where: { AND: [resourcesInScope(scope), skillNamesFilter(skillNames)] },
        include: resourceInclude,
        orderBy: [{ level: "asc" }],
        take: TUTOR_RESOURCES,
      })
    : [];
  const labelled = resources.map((r, i) => ({ ref: `R${i + 1}`, resource: r }));

  const result = await aiTutor({
    question: input.question,
    skill: input.skill,
    studentSkills: student.skills.map((s) => s.skill.name),
    history: input.history.slice(-8),
    resources: labelled.map(({ ref, resource }) => ({
      id: ref,
      title: resource.title,
      type: resource.type,
      provider: resource.provider ?? "",
      level: resource.level ?? "",
      description: resource.description ?? "",
    })),
  });

  const byRef = new Map(labelled.map(({ ref, resource }) => [ref, resource]));
  return {
    answer: result.answer,
    source: result.source,
    // Refs like [R2] in the answer are resolved to real library entries.
    references: labelled.map(({ ref, resource }) => ({ ref, id: resource.id, title: resource.title, url: resource.url })),
    cited: result.resources.map((ref) => byRef.get(ref)).filter(Boolean),
  };
}
