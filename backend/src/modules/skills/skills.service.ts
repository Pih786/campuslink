import { Prisma, Skill } from "@prisma/client";
import { prisma } from "../../config/prisma";

export async function listSkills() {
  return prisma.skill.findMany({ orderBy: { name: "asc" } });
}

// "  java " and "Java" are the same skill. Eligibility compares skill ids, so
// letting spelling variants become separate rows made students who clearly
// have a skill look ineligible.
export function normalizeSkillName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export const skillKey = (name: string) => normalizeSkillName(name).toLowerCase();

// When variants already exist, prefer the one that isn't all lowercase
// ("Java" over "java"), then plain character order, which is stable and
// favours capitals ("REST API" over "Rest API").
export function pickCanonical<T extends { name: string }>(candidates: T[]): T {
  return [...candidates].sort(
    (a, b) =>
      Number(a.name === a.name.toLowerCase()) - Number(b.name === b.name.toLowerCase()) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  )[0];
}

function sameNameAs(names: string[]): Prisma.SkillWhereInput {
  return { OR: names.map((name) => ({ name: { equals: name, mode: "insensitive" as const } })) };
}

export async function findOrCreateSkill(name: string, category?: string): Promise<Skill> {
  const normalized = normalizeSkillName(name);
  const existing = await prisma.skill.findMany({ where: sameNameAs([normalized]) });
  if (existing.length) return pickCanonical(existing);
  try {
    return await prisma.skill.create({ data: { name: normalized, category } });
  } catch (err) {
    // Created by a concurrent request in the meantime.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return pickCanonical(await prisma.skill.findMany({ where: sameNameAs([normalized]) }));
    }
    throw err;
  }
}

// Batch version for many names at once: a fixed three round trips instead of
// several per skill, which matters on a remote database. Returns one skill
// per distinct (case-insensitive) name.
export async function findOrCreateSkills(names: string[]): Promise<Skill[]> {
  const byKey = new Map<string, string>();
  for (const n of names) {
    const normalized = normalizeSkillName(n);
    if (normalized && !byKey.has(normalized.toLowerCase())) byKey.set(normalized.toLowerCase(), normalized);
  }
  if (!byKey.size) return [];
  const wanted = [...byKey.values()];

  const load = async () => {
    const rows = await prisma.skill.findMany({ where: sameNameAs(wanted) });
    const groups = new Map<string, Skill[]>();
    for (const row of rows) groups.set(skillKey(row.name), [...(groups.get(skillKey(row.name)) ?? []), row]);
    return groups;
  };

  let groups = await load();
  const missing = wanted.filter((n) => !groups.has(n.toLowerCase()));
  if (missing.length) {
    await prisma.skill.createMany({ data: missing.map((name) => ({ name })), skipDuplicates: true });
    groups = await load();
  }
  return [...groups.values()].map(pickCanonical);
}
