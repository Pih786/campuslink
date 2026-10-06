// One-off: move resumes uploaded before private storage existed out of the
// public uploads/ folder and store bare file names in resumeUrl. Re-runnable.
import fs from "fs";
import path from "path";
import { prisma } from "../src/config/prisma";
import { privateResumeDir } from "../src/utils/upload";

const legacyDir = path.join(process.cwd(), "uploads", "resumes");

async function main() {
  const students = await prisma.student.findMany({ where: { resumeUrl: { startsWith: "/uploads/" } } });
  let moved = 0;
  let missing = 0;
  for (const s of students) {
    const name = path.basename(s.resumeUrl as string);
    const from = path.join(legacyDir, name);
    const to = path.join(privateResumeDir, name);
    if (fs.existsSync(from)) {
      await fs.promises.rename(from, to);
      moved++;
    } else if (!fs.existsSync(to)) {
      missing++;
    }
    await prisma.student.update({ where: { id: s.id }, data: { resumeUrl: name } });
  }

  // Files not referenced by any student (e.g. replaced uploads) are removed.
  const leftovers = fs.existsSync(legacyDir)
    ? fs.readdirSync(legacyDir).filter((f) => f !== ".gitkeep")
    : [];
  for (const f of leftovers) await fs.promises.unlink(path.join(legacyDir, f));

  console.log(`Updated ${students.length} student(s): ${moved} file(s) moved, ${missing} missing, ${leftovers.length} orphaned file(s) removed.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
