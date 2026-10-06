import { PrismaClient } from "@prisma/client";

// Singleton Prisma client. We do NOT connect eagerly / block startup on a DB
// ping here — Prisma's client connects lazily on first query, so the server
// can boot even if DATABASE_URL is unreachable. Individual requests that need
// the DB will fail gracefully (caught by the global error handler) instead of
// crashing the process.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    // Neon suspends idle databases; the first queries after a wake-up and
    // cross-region round trips (~300 ms each) can exceed the 2 s / 5 s defaults.
    transactionOptions: { maxWait: 10000, timeout: 20000 },
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
