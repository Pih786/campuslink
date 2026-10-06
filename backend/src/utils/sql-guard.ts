const FORBIDDEN_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "drop",
  "alter",
  "truncate",
  "grant",
  "revoke",
  "create",
  "copy",
  "into",
  "call",
  "do",
  "vacuum",
  "comment",
  "listen",
  "notify",
  "execute",
  "prepare",
  "deallocate",
  "reset",
  "begin",
  "commit",
  "rollback",
  "savepoint",
  "lock",
  "set",
  "grant",
  "pg_terminate_backend",
  "pg_cancel_backend",
  "dblink",
];

export interface SqlGuardResult {
  ok: boolean;
  reason?: string;
}

// Whitelist-first defense: the query must be a single, plain SELECT/WITH
// statement. This is a best-effort guard, NOT the primary security
// boundary — the primary boundary is that student queries only ever run
// under the read-only `sql_lab_runner` role with no access to real app
// data (see config/sql-lab-prisma.ts). This guard just blocks the more
// obvious ways to abuse a SELECT context (multiple statements, mutating
// function calls, session/transaction control).
export function guardStudentQuery(rawQuery: string): SqlGuardResult {
  const trimmed = rawQuery.trim();

  if (!trimmed) {
    return { ok: false, reason: "Query is empty" };
  }

  const withoutTrailingSemicolon = trimmed.replace(/;\s*$/, "");
  if (withoutTrailingSemicolon.includes(";")) {
    return { ok: false, reason: "Only a single SQL statement is allowed" };
  }

  const firstWordMatch = withoutTrailingSemicolon.match(/^\s*(\w+)/);
  const firstWord = firstWordMatch?.[1]?.toLowerCase();
  if (firstWord !== "select" && firstWord !== "with") {
    return { ok: false, reason: "Only SELECT / WITH queries are allowed" };
  }

  const lower = withoutTrailingSemicolon.toLowerCase();
  for (const keyword of FORBIDDEN_KEYWORDS) {
    const pattern = new RegExp(`(^|[^a-zA-Z0-9_])${keyword}([^a-zA-Z0-9_]|$)`, "i");
    if (pattern.test(lower)) {
      return { ok: false, reason: `Query contains a disallowed keyword: ${keyword}` };
    }
  }

  return { ok: true };
}
