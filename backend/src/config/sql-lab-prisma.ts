import { PrismaClient } from "@prisma/client";
import { env } from "./env";

// A SEPARATE Prisma client bound to the low-privilege `sql_lab_runner`
// Postgres role (see scripts/setup-sql-lab-role.ts), used ONLY to execute
// student-submitted SQL. It has no access to the `public` schema where all
// real application data lives — student queries run under this client can
// never read or modify students/applications/offers/etc. The main `prisma`
// client (owner role) is used for everything else, including creating the
// SQL Lab's own per-problem schemas/tables.
declare global {
  // eslint-disable-next-line no-var
  var __sqlLabPrisma: PrismaClient | undefined;
}

export const sqlLabPrisma =
  global.__sqlLabPrisma ||
  new PrismaClient({
    datasources: { db: { url: env.SQL_LAB_DATABASE_URL } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__sqlLabPrisma = sqlLabPrisma;
}
