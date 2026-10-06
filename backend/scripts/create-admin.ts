// Creates (or promotes) a platform admin. Admins approve the first placement
// officer of each college and keep the college directory clean.
//
//   npx tsx scripts/create-admin.ts <email> <password> "<full name>"
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";

async function main() {
  const [email, password, fullName = "Platform Admin"] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: npx tsx scripts/create-admin.ts <email> <password> "<full name>"');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    console.error("Password must be at least 8 characters with a letter and a number.");
    process.exitCode = 1;
    return;
  }

  const normalized = email.trim().toLowerCase();
  const existing = await prisma.user.findFirst({ where: { email: { equals: normalized, mode: "insensitive" } } });
  const passwordHash = await hashPassword(password);
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { role: "ADMIN", passwordHash, fullName } });
    console.log(`Updated ${normalized} to ADMIN.`);
  } else {
    await prisma.user.create({ data: { email: normalized, passwordHash, fullName, role: "ADMIN" } });
    console.log(`Created admin ${normalized}.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
