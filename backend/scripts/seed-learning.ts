// Re-runnable: loads the curated learning library (shared with every college).
//
//   npx tsx scripts/seed-learning.ts
//
// Existing entries are matched on URL + skill and updated in place, so
// running it again never creates duplicates or touches college-added items.
import { prisma } from "../src/config/prisma";
import { findOrCreateSkill } from "../src/modules/skills/skills.service";
import { LEARNING_RESOURCES } from "../prisma/data/learning-resources";

async function main() {
  let created = 0;
  let updated = 0;
  for (const r of LEARNING_RESOURCES) {
    const skill = await findOrCreateSkill(r.skill);
    const data = {
      skillId: skill.id,
      title: r.title,
      url: r.url,
      type: r.type,
      provider: r.provider,
      level: r.level,
      durationMinutes: r.durationMinutes ?? null,
      description: r.description,
      collegeId: null,
    };
    const existing = await prisma.learningResource.findFirst({
      where: { url: r.url, skillId: skill.id, collegeId: null },
    });
    if (existing) {
      await prisma.learningResource.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.learningResource.create({ data });
      created++;
    }
  }
  console.log(`Learning library: ${created} added, ${updated} updated.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
