import { test } from "node:test";
import assert from "node:assert/strict";
import { detectDriveConflicts, suggestDriveSlot, DriveSlot } from "../src/modules/drives/drive-conflicts";

function at(hour: number, minute = 0, day = 1): Date {
  return new Date(2030, 0, day, hour, minute);
}

const existing: DriveSlot = {
  id: "d1",
  jobId: "job-a",
  start: at(10),
  durationMinutes: 120,
  venue: "Main Auditorium",
  label: "Acme · SDE",
};

const students = new Map<string, Set<string>>([
  ["job-a", new Set(["s1", "s2", "s3"])],
  ["job-b", new Set(["s2", "s3", "s4"])],
  ["job-c", new Set(["s9"])],
]);

test("drive conflicts: same venue at an overlapping time blocks", () => {
  const candidate: DriveSlot = { jobId: "job-c", start: at(11), durationMinutes: 60, venue: " main  auditorium " };
  const conflicts = detectDriveConflicts(candidate, [existing], students);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].type, "VENUE_DOUBLE_BOOKED");
  assert.equal(conflicts[0].severity, "blocking");
});

test("drive conflicts: students in both overlapping drives is a warning naming the count", () => {
  const candidate: DriveSlot = { jobId: "job-b", start: at(11), durationMinutes: 60, venue: "Lab 3" };
  const [conflict] = detectDriveConflicts(candidate, [existing], students);
  assert.equal(conflict.type, "STUDENTS_IN_BOTH");
  assert.equal(conflict.severity, "warning");
  assert.deepEqual(conflict.sharedStudentIds?.sort(), ["s2", "s3"]);
});

test("drive conflicts: overlapping drive with no shared students or venue is info only", () => {
  const candidate: DriveSlot = { jobId: "job-c", start: at(10, 30), durationMinutes: 60, venue: "Lab 3" };
  const [conflict] = detectDriveConflicts(candidate, [existing], students);
  assert.equal(conflict.type, "SLOT_OVERLAP");
  assert.equal(conflict.severity, "info");
});

test("drive conflicts: back-to-back drives do not overlap", () => {
  const candidate: DriveSlot = { jobId: "job-b", start: at(12), durationMinutes: 60, venue: "Main Auditorium" };
  assert.deepEqual(detectDriveConflicts(candidate, [existing], students), []);
});

test("drive slot suggestion: next free slot after the clash, inside working hours", () => {
  const candidate: DriveSlot = { jobId: "job-b", start: at(10), durationMinutes: 120, venue: "Main Auditorium" };
  const slot = suggestDriveSlot(candidate, [existing], students);
  assert.deepEqual(slot, at(12));
});

test("drive slot suggestion: rolls to the next morning when the day is full", () => {
  const busyDay: DriveSlot = { ...existing, id: "d2", start: at(9), durationMinutes: 540 };
  const candidate: DriveSlot = { jobId: "job-b", start: at(14), durationMinutes: 180, venue: "Main Auditorium" };
  const slot = suggestDriveSlot(candidate, [busyDay], students);
  assert.deepEqual(slot, at(9, 0, 2));
});

// Property check: on random schedules, the detector must agree with a
// brute-force minute-by-minute overlap check, and a suggested slot must be
// genuinely free of venue and shared-student clashes.
test("drive conflicts: agrees with brute force on 500 random schedules", () => {
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const venues = ["Hall A", "Hall B", "Lab 1"];
  const jobs = ["j1", "j2", "j3", "j4"];
  const studentsByJob = new Map<string, Set<string>>(
    jobs.map((j, i) => [j, new Set([`s${i}`, `s${(i + 1) % jobs.length}`, "shared"].slice(0, 2 + (i % 2)))])
  );

  const busyMinutes = (s: DriveSlot) => {
    const out = new Set<number>();
    const start = s.start.getTime() / 60000;
    for (let m = 0; m < s.durationMinutes; m++) out.add(start + m);
    return out;
  };

  for (let run = 0; run < 500; run++) {
    const make = (id: string): DriveSlot => ({
      id,
      jobId: jobs[Math.floor(rand() * jobs.length)],
      start: at(9 + Math.floor(rand() * 8), rand() < 0.5 ? 0 : 30),
      durationMinutes: [60, 90, 120, 180][Math.floor(rand() * 4)],
      venue: venues[Math.floor(rand() * venues.length)],
    });
    const others = [make("a"), make("b"), make("c")];
    const candidate = make("new");
    const conflicts = detectDriveConflicts(candidate, others, studentsByJob);

    for (const other of others) {
      const mine = busyMinutes(candidate);
      const overlap = [...busyMinutes(other)].some((m) => mine.has(m));
      const sameVenue = other.venue === candidate.venue;
      const shared =
        other.jobId !== candidate.jobId &&
        [...(studentsByJob.get(candidate.jobId) ?? [])].some((s) => studentsByJob.get(other.jobId)?.has(s));
      const found = conflicts.filter((c) => c.otherDriveId === other.id).map((c) => c.type);

      assert.equal(found.includes("VENUE_DOUBLE_BOOKED"), overlap && sameVenue, `venue, run ${run}`);
      assert.equal(found.includes("STUDENTS_IN_BOTH"), overlap && shared, `students, run ${run}`);
      assert.equal(found.includes("SLOT_OVERLAP"), overlap && !sameVenue && !shared, `overlap, run ${run}`);
    }

    const slot = suggestDriveSlot(candidate, others, studentsByJob);
    if (slot) {
      const trial = { ...candidate, start: slot };
      const serious = detectDriveConflicts(trial, others, studentsByJob).filter((c) => c.severity !== "info");
      assert.equal(serious.length, 0, `suggested slot clashes, run ${run}`);
      assert.ok(slot.getTime() >= candidate.start.getTime() - 30 * 60000, `slot before request, run ${run}`);
    }
  }
});
