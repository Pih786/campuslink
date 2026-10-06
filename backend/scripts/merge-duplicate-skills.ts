// Re-runnable: merges skills that differ only in letter case or spacing
// ("java", "Java", "JAVA ") into one, so eligibility (which compares skill
// ids) treats them as the same skill.
//
//   npx tsx scripts/merge-duplicate-skills.ts --dry-run   # show the plan
//   npx tsx scripts/merge-duplicate-skills.ts             # apply it
//
// For each group the kept spelling is the one that isn't all lowercase.
// Every reference moves to it. A student who has both spellings keeps the
// higher level, and the verified flag if either row was verified. A job that
// required both spellings keeps one requirement (required wins over
// preferred, the higher minimum level wins).
import { prisma } from "../src/config/prisma";
import { pickCanonical, skillKey } from "../src/modules/skills/skills.service";

const dryRun = process.argv.includes("--dry-run");

async function mergeInto(keepId: string, dropId: string) {
  await prisma.$transaction(async (tx) => {
    // Student skills: unique per (student, skill).
    const dropRows = await tx.studentSkill.findMany({ where: { skillId: dropId } });
    for (const row of dropRows) {
      const kept = await tx.studentSkill.findUnique({
        where: { studentId_skillId: { studentId: row.studentId, skillId: keepId } },
      });
      if (!kept) {
        await tx.studentSkill.update({ where: { id: row.id }, data: { skillId: keepId } });
        continue;
      }
      const stronger = row.proficiency > kept.proficiency ? row : kept;
      await tx.studentSkill.update({
        where: { id: kept.id },
        data: {
          proficiency: Math.max(row.proficiency, kept.proficiency),
          verified: row.verified || kept.verified,
          source: stronger.source,
        },
      });
      await tx.studentSkill.delete({ where: { id: row.id } });
    }

    // Job requirements: one per (job, skill).
    const dropReqs = await tx.jobRequirement.findMany({ where: { skillId: dropId } });
    for (const req of dropReqs) {
      const kept = await tx.jobRequirement.findFirst({ where: { jobId: req.jobId, skillId: keepId } });
      if (!kept) {
        await tx.jobRequirement.update({ where: { id: req.id }, data: { skillId: keepId } });
        continue;
      }
      await tx.jobRequirement.update({
        where: { id: kept.id },
        data: {
          mandatory: kept.mandatory || req.mandatory,
          minimumProficiency: Math.max(kept.minimumProficiency ?? 1, req.minimumProficiency ?? 1),
          weight: Math.max(kept.weight, req.weight),
        },
      });
      await tx.jobRequirement.delete({ where: { id: req.id } });
    }

    // Everything else just points at the kept skill.
    await tx.skillEvidence.updateMany({ where: { skillId: dropId }, data: { skillId: keepId } });
    await tx.codingProblem.updateMany({ where: { skillId: dropId }, data: { skillId: keepId } });
    await tx.sqlProblem.updateMany({ where: { skillId: dropId }, data: { skillId: keepId } });
    await tx.assessment.updateMany({ where: { skillId: dropId }, data: { skillId: keepId } });
    await tx.learningResource.updateMany({ where: { skillId: dropId }, data: { skillId: keepId } });

    await tx.skill.delete({ where: { id: dropId } });
  });
}

async function main() {
  const skills = await prisma.skill.findMany({
    include: { _count: { select: { studentSkills: true, jobRequirements: true } } },
  });
  const groups = new Map<string, typeof skills>();
  for (const s of skills) groups.set(skillKey(s.name), [...(groups.get(skillKey(s.name)) ?? []), s]);
  const duplicates = [...groups.values()].filter((g) => g.length > 1);

  if (!duplicates.length) {
    console.log("No duplicate skills.");
    return;
  }

  for (const group of duplicates) {
    const keep = pickCanonical(group);
    const drop = group.filter((s) => s.id !== keep.id);
    console.log(
      `${dryRun ? "[dry run] " : ""}"${keep.name}" ← ${drop
        .map((d) => `"${d.name}" (${d._count.studentSkills} students, ${d._count.jobRequirements} job requirements)`)
        .join(", ")}`
    );
    if (dryRun) continue;
    // Afterwards the kept row gets the normalised spelling (trimmed, single spaces).
    const cleanName = keep.name.trim().replace(/\s+/g, " ");
    for (const d of drop) await mergeInto(keep.id, d.id);
    if (cleanName !== keep.name) await prisma.skill.update({ where: { id: keep.id }, data: { name: cleanName } });
  }
  console.log(dryRun ? `\n${duplicates.length} groups would be merged.` : `\nMerged ${duplicates.length} groups.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
