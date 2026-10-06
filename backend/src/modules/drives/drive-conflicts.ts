// Pure drive-scheduling checks. Callers load drives and shortlisted students.

export interface DriveSlot {
  id?: string;
  jobId: string;
  start: Date;
  durationMinutes: number;
  venue?: string | null;
  label?: string;
}

export type DriveConflictType = "VENUE_DOUBLE_BOOKED" | "STUDENTS_IN_BOTH" | "SLOT_OVERLAP";

export interface DriveConflict {
  type: DriveConflictType;
  // blocking: cannot be saved; warning: saveable but needs attention; info: FYI.
  severity: "blocking" | "warning" | "info";
  otherDriveId?: string;
  otherDriveLabel?: string;
  venue?: string;
  sharedStudentIds?: string[];
  message: string;
}

const WORKDAY_START_HOUR = 9;
const WORKDAY_END_HOUR = 18;
const SEARCH_STEP_MINUTES = 30;
const SEARCH_DAYS = 14;

export function driveEnd(slot: Pick<DriveSlot, "start" | "durationMinutes">): Date {
  return new Date(slot.start.getTime() + slot.durationMinutes * 60000);
}

function overlaps(a: DriveSlot, b: DriveSlot): boolean {
  return a.start < driveEnd(b) && b.start < driveEnd(a);
}

function sameVenue(a?: string | null, b?: string | null): boolean {
  const norm = (v?: string | null) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return Boolean(norm(a)) && norm(a) === norm(b);
}

// studentsByJob: students actively in process (applied..selected) per job.
export function detectDriveConflicts(
  candidate: DriveSlot,
  others: DriveSlot[],
  studentsByJob: Map<string, Set<string>>
): DriveConflict[] {
  const conflicts: DriveConflict[] = [];
  const mine = studentsByJob.get(candidate.jobId) ?? new Set<string>();

  for (const other of others) {
    if (other.id && other.id === candidate.id) continue;
    if (!overlaps(candidate, other)) continue;

    const label = other.label ?? "another drive";
    let flagged = false;

    if (sameVenue(candidate.venue, other.venue)) {
      flagged = true;
      conflicts.push({
        type: "VENUE_DOUBLE_BOOKED",
        severity: "blocking",
        otherDriveId: other.id,
        otherDriveLabel: other.label,
        venue: other.venue ?? undefined,
        message: `${other.venue} is already booked for ${label} at an overlapping time`,
      });
    }

    const theirs = studentsByJob.get(other.jobId) ?? new Set<string>();
    const shared = other.jobId === candidate.jobId ? [] : [...mine].filter((id) => theirs.has(id));
    if (shared.length > 0) {
      flagged = true;
      conflicts.push({
        type: "STUDENTS_IN_BOTH",
        severity: "warning",
        otherDriveId: other.id,
        otherDriveLabel: other.label,
        sharedStudentIds: shared,
        message: `${shared.length} student${shared.length === 1 ? " is" : "s are"} in process for both this drive and ${label}, which overlap`,
      });
    }

    if (!flagged) {
      conflicts.push({
        type: "SLOT_OVERLAP",
        severity: "info",
        otherDriveId: other.id,
        otherDriveLabel: other.label,
        message: `Runs at the same time as ${label} (different venue, no shared students)`,
      });
    }
  }

  return conflicts;
}

// Earliest start at or after `from`, inside working hours, with no blocking
// or warning conflicts. Returns null if nothing is free within two weeks.
export function suggestDriveSlot(
  candidate: DriveSlot,
  others: DriveSlot[],
  studentsByJob: Map<string, Set<string>>,
  from: Date = candidate.start
): Date | null {
  const cursor = new Date(from);
  cursor.setSeconds(0, 0);
  const remainder = cursor.getMinutes() % SEARCH_STEP_MINUTES;
  if (remainder) cursor.setMinutes(cursor.getMinutes() + SEARCH_STEP_MINUTES - remainder);

  const limit = cursor.getTime() + SEARCH_DAYS * 24 * 60 * 60000;
  while (cursor.getTime() <= limit) {
    const endHour = cursor.getHours() + cursor.getMinutes() / 60 + candidate.durationMinutes / 60;
    const inHours = cursor.getHours() >= WORKDAY_START_HOUR && endHour <= WORKDAY_END_HOUR;
    if (inHours) {
      const trial = { ...candidate, start: new Date(cursor) };
      const problems = detectDriveConflicts(trial, others, studentsByJob).filter((c) => c.severity !== "info");
      if (problems.length === 0) return trial.start;
    }
    cursor.setMinutes(cursor.getMinutes() + SEARCH_STEP_MINUTES);
  }
  return null;
}
