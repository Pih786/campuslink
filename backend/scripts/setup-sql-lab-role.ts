import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

// One-time bootstrap: creates a dedicated, low-privilege Postgres role for
// the SQL Lab so student-submitted queries NEVER run under the app's owner
// credentials (which have full access to the real `public` schema/data).
// Run once: `npx tsx scripts/setup-sql-lab-role.ts`
// Prints a connection string — copy it into .env as SQL_LAB_DATABASE_URL.

const ROLE_NAME = "sql_lab_runner";

async function main() {
  const prisma = new PrismaClient();
  const password = crypto.randomBytes(18).toString("base64url");

  const existing = await prisma.$queryRawUnsafe<{ rolname: string }[]>(
    `SELECT rolname FROM pg_roles WHERE rolname = $1`,
    ROLE_NAME
  );

  if (existing.length > 0) {
    await prisma.$executeRawUnsafe(
      `ALTER ROLE ${ROLE_NAME} WITH PASSWORD '${password}'`
    );
    console.log(`Role ${ROLE_NAME} already existed — password rotated.`);
  } else {
    await prisma.$executeRawUnsafe(
      `CREATE ROLE ${ROLE_NAME} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`
    );
    console.log(`Role ${ROLE_NAME} created.`);
  }

  // Explicitly ensure it can never touch the real app schema/data,
  // regardless of any default PUBLIC grants on this database.
  await prisma.$executeRawUnsafe(`REVOKE ALL ON SCHEMA public FROM ${ROLE_NAME}`);
  await prisma.$executeRawUnsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ROLE_NAME}`);

  const dbUrl = new URL(process.env.DATABASE_URL as string);
  dbUrl.username = ROLE_NAME;
  dbUrl.password = password;

  console.log("\nAdd this to backend/.env as SQL_LAB_DATABASE_URL:\n");
  console.log(dbUrl.toString());

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
