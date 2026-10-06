import { prisma } from "../../config/prisma";

const EVIDENCE_PROFICIENCY_FLOOR = 3;

// Records a verified skill-evidence event and bumps the student's
// self-reported proficiency up to at least EVIDENCE_PROFICIENCY_FLOOR
// (never lowers an existing higher proficiency). Called whenever a
// coding submission, SQL submission, or assessment attempt passes.
export async function recordSkillEvidence(params: {
  studentId: string;
  skillId: string;
  sourceType: "CODING" | "SQL" | "ASSESSMENT" | "MOCK_INTERVIEW";
  sourceId: string;
  score: number;
}) {
  await prisma.skillEvidence.create({
    data: {
      studentId: params.studentId,
      skillId: params.skillId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      score: params.score,
      verified: true,
    },
  });

  const existing = await prisma.studentSkill.findUnique({
    where: { studentId_skillId: { studentId: params.studentId, skillId: params.skillId } },
  });

  const nextProficiency = Math.max(
    existing?.proficiency ?? 0,
    EVIDENCE_PROFICIENCY_FLOOR
  );

  // The evidence row keeps the precise origin; the skill row uses the
  // closest SkillSource value.
  const source = params.sourceType === "MOCK_INTERVIEW" ? "INTERVIEW" : params.sourceType;

  await prisma.studentSkill.upsert({
    where: { studentId_skillId: { studentId: params.studentId, skillId: params.skillId } },
    update: { verified: true, proficiency: nextProficiency, source },
    create: {
      studentId: params.studentId,
      skillId: params.skillId,
      proficiency: nextProficiency,
      verified: true,
      source,
    },
  });
}

export async function getSkillPassport(studentId: string) {
  const [studentSkills, evidenceRows] = await Promise.all([
    prisma.studentSkill.findMany({
      where: { studentId },
      include: { skill: true },
    }),
    prisma.skillEvidence.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const evidenceBySkill = new Map<string, typeof evidenceRows>();
  for (const row of evidenceRows) {
    const list = evidenceBySkill.get(row.skillId) ?? [];
    list.push(row);
    evidenceBySkill.set(row.skillId, list);
  }

  return studentSkills
    .map((s) => {
      const evidence = evidenceBySkill.get(s.skillId) ?? [];
      return {
        skillId: s.skillId,
        name: s.skill.name,
        category: s.skill.category,
        proficiency: s.proficiency,
        verified: s.verified,
        source: s.source,
        evidenceCount: evidence.length,
        evidence: evidence.map((e) => ({
          sourceType: e.sourceType,
          score: e.score,
          createdAt: e.createdAt,
        })),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
