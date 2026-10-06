// One-off: map free-typed branch values from before the branch dropdown
// (e.g. "B.Tech CSE", "mca") to the codes the eligibility engine compares
// against. Prints every change; values it can't map are left untouched.
import { prisma } from "../src/config/prisma";

const RULES: [RegExp, string][] = [
  [/\b(cse|computer science)\b/i, "CSE"],
  [/\b(it|information technology)\b/i, "IT"],
  [/\b(ece|electronics( and| &)? communication)\b/i, "ECE"],
  [/\b(eee|electrical)\b/i, "EEE"],
  [/\b(me|mech|mechanical)\b/i, "ME"],
  [/\bcivil\b/i, "Civil"],
  [/\bmca\b/i, "MCA"],
];

const CODES = new Set(RULES.map(([, code]) => code));

async function main() {
  const students = await prisma.student.findMany({
    where: { department: { not: null } },
    select: { id: true, department: true, user: { select: { fullName: true } } },
  });

  let changed = 0;
  for (const s of students) {
    const current = (s.department ?? "").trim();
    if (CODES.has(current)) continue;
    const match = RULES.find(([pattern]) => pattern.test(current));
    if (!match) {
      console.log(`skip   ${s.user.fullName}: "${current}" (no rule)`);
      continue;
    }
    await prisma.student.update({ where: { id: s.id }, data: { department: match[1] } });
    console.log(`update ${s.user.fullName}: "${current}" -> "${match[1]}"`);
    changed++;
  }
  console.log(`${changed} student(s) updated.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
