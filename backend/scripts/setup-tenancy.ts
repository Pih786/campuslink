// One-off, re-runnable: load the curated college directory and move data
// created before multi-tenancy onto a college, so nothing loses access.
//
//   npx tsx scripts/setup-tenancy.ts [defaultCollegeName]
//
// * Upserts every curated college (verified).
// * Every existing officer without a college is attached, APPROVED, to the
//   default college (default: "Demo Institute of Technology").
// * Drives without a college are assigned to the default college.
// * Jobs keep their current visibility (GLOBAL by default).
import { prisma } from "../src/config/prisma";
import { INDIAN_COLLEGES } from "../prisma/data/indian-colleges";

async function main() {
  const defaultName = process.argv[2] ?? "Demo Institute of Technology";

  let created = 0;
  for (const c of INDIAN_COLLEGES) {
    const existing = await prisma.college.findUnique({ where: { name: c.name } });
    if (existing) {
      await prisma.college.update({
        where: { id: existing.id },
        data: { city: c.city, state: c.state, category: c.category, verified: true },
      });
    } else {
      await prisma.college.create({ data: { ...c, verified: true } });
      created++;
    }
  }
  console.log(`Directory: ${INDIAN_COLLEGES.length} curated colleges (${created} new).`);

  const fallback = await prisma.college.upsert({
    where: { name: defaultName },
    update: { verified: true },
    create: { name: defaultName, verified: true, category: "Demo" },
  });

  const officers = await prisma.user.findMany({
    where: { role: "PLACEMENT_OFFICER", collegeStaff: null },
    select: { id: true, email: true },
  });
  for (const o of officers) {
    await prisma.collegeStaff.create({
      data: { userId: o.id, collegeId: fallback.id, status: "APPROVED", reviewedAt: new Date() },
    });
  }
  console.log(`Officers attached to "${fallback.name}": ${officers.length}`);

  const drives = await prisma.drive.updateMany({ where: { collegeId: null }, data: { collegeId: fallback.id } });
  console.log(`Drives assigned to "${fallback.name}": ${drives.count}`);

  const orphanStudents = await prisma.student.updateMany({ where: { collegeId: null }, data: { collegeId: fallback.id } });
  console.log(`Students without a college assigned: ${orphanStudents.count}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
