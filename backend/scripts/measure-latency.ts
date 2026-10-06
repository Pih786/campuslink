// Measures p50/p95 latency of the heavier endpoints against a running backend.
// Usage: npx tsx scripts/measure-latency.ts <studentEmail> <studentPassword>
//        (officer credentials come from OFFICER_EMAIL / OFFICER_PASSWORD, and
//         the API base from API_URL, default http://localhost:5000/api/v1)
const API = process.env.API_URL ?? "http://localhost:5000/api/v1";
const RUNS = Number(process.env.RUNS ?? 10);

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

function percentile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function measure(label: string, token: string, method: string, path: string, body?: unknown) {
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    await res.arrayBuffer();
    if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  console.log(`| ${label} | ${Math.round(percentile(times, 50))} | ${Math.round(percentile(times, 95))} |`);
}

async function main() {
  const [studentEmail, studentPassword] = process.argv.slice(2);
  const officer = await login(process.env.OFFICER_EMAIL ?? "officer@campuslink.dev", process.env.OFFICER_PASSWORD ?? "Officer@123");
  const student = studentEmail ? await login(studentEmail, studentPassword) : null;

  const jobs = (await (await fetch(`${API}/jobs?limit=1`, { headers: { Authorization: `Bearer ${officer}` } })).json()) as {
    data: { id: string }[];
  };
  const jobId = jobs.data[0]?.id;

  console.log(`${RUNS} requests each against ${API}\n`);
  console.log("| Endpoint | p50 ms | p95 ms |\n|---|---|---|");
  if (student) await measure("Student job matches (all roles, with AI scoring)", student, "GET", "/matching/student/me/jobs?include=all");
  if (student) await measure("Student readiness by role", student, "GET", "/students/me/readiness");
  if (jobId) await measure("Ranked candidates for a job", officer, "GET", `/matching/job/${jobId}/candidates`);
  await measure("Placement insights (cached)", officer, "GET", "/analytics/insights");
  await measure("Placement insights (fresh)", officer, "GET", "/analytics/insights?fresh=true");
  if (jobId) {
    await measure("Drive clash check", officer, "POST", "/drives/check", {
      jobId,
      date: new Date(Date.now() + 3 * 86400000).toISOString(),
      durationMinutes: 240,
      venue: "Main Auditorium",
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
