import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CircleCheck, Clock, Info, MapPin, Plus, ShieldAlert, Users } from "lucide-react";
import { api } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { formatDate, formatDateTime, formatTime, relativeTime, toLocalInputValue } from "../../lib/format";
import Modal from "../../components/common/Modal";
import { Alert, EmptyState, PageHeader, PageSkeleton, Spinner, StatusBadge } from "../../components/ui";

const INTERVIEW_CONFLICT_LABELS = {
  STUDENT_DOUBLE_BOOKED: "Student double-booked for two interviews",
  PANEL_DOUBLE_BOOKED: "Interview panel double-booked",
};

const DURATIONS = [
  { value: 120, label: "2 hours" },
  { value: 180, label: "3 hours" },
  { value: 240, label: "Half day (4 hours)" },
  { value: 480, label: "Full day (8 hours)" },
];

const EMPTY_FORM = {
  companyId: "",
  jobId: "",
  date: "",
  durationMinutes: 240,
  venue: "",
  capacity: "",
  applicationDeadline: "",
};

function formatDuration(minutes) {
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function ScheduleConflicts({ conflicts, suggestedSlot, onUseSlot }) {
  if (!conflicts?.length) return null;
  const serious = conflicts.filter((c) => c.severity !== "info");
  const info = conflicts.filter((c) => c.severity === "info");

  return (
    <div className="schedule-conflicts">
      {serious.map((c, i) => (
        <div key={`s-${i}`} className={`inline-result ${c.severity === "blocking" ? "is-bad" : "is-warn"}`}>
          <ShieldAlert aria-hidden="true" />
          <div>
            <strong>{c.severity === "blocking" ? "Venue clash" : "Students in both drives"}</strong>
            <p>{c.message}.</p>
            {c.sharedStudents?.length > 0 && (
              <p className="inline-result-sub">
                {c.sharedStudents.slice(0, 5).join(", ")}
                {c.sharedStudents.length > 5 ? ` and ${c.sharedStudents.length - 5} more` : ""}
              </p>
            )}
          </div>
        </div>
      ))}
      {info.map((c, i) => (
        <div key={`i-${i}`} className="inline-result is-info">
          <Info aria-hidden="true" />
          <span>{c.message}.</span>
        </div>
      ))}
      {suggestedSlot && onUseSlot && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onUseSlot(suggestedSlot)}>
          Use next clash-free slot · {formatDateTime(suggestedSlot)}
        </button>
      )}
    </div>
  );
}

function CreateDriveModal({ companies, jobs, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);

  const companyJobs = jobs.filter((j) => j.companyId === form.companyId);

  const update = (field, value) =>
    setForm((prev) => ({ ...prev, [field]: value, ...(field === "companyId" ? { jobId: "" } : {}) }));

  // Re-check the schedule shortly after the relevant fields settle.
  useEffect(() => {
    if (!form.jobId || !form.date) {
      setCheck(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await api.post("/drives/check", {
          jobId: form.jobId,
          date: new Date(form.date).toISOString(),
          durationMinutes: Number(form.durationMinutes),
          venue: form.venue || undefined,
        });
        if (!cancelled) setCheck(res.data);
      } catch {
        if (!cancelled) setCheck(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.jobId, form.date, form.durationMinutes, form.venue]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await api.post("/drives", {
        companyId: form.companyId,
        jobId: form.jobId,
        date: new Date(form.date).toISOString(),
        durationMinutes: Number(form.durationMinutes),
        venue: form.venue || undefined,
        capacity: form.capacity ? Number(form.capacity) : undefined,
        applicationDeadline: form.applicationDeadline
          ? new Date(`${form.applicationDeadline}T23:59:00`).toISOString()
          : undefined,
      });
      onCreated(res.data);
    } catch (err) {
      if (err.code === "DRIVE_CONFLICT") {
        setCheck({ conflicts: err.details?.conflicts ?? [], blocking: true, suggestedSlot: err.details?.suggestedSlot });
      } else {
        setError(err.message || "Could not create the drive");
      }
    } finally {
      setSaving(false);
    }
  };

  const hasWarnings = check?.conflicts?.some((c) => c.severity === "warning");

  return (
    <Modal
      open
      onClose={onClose}
      title="New placement drive"
      subtitle="Clashes with other drives are checked as you fill this in"
      width={600}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="create-drive-form" className="btn btn-primary" disabled={saving || check?.blocking}>
            {saving && <Spinner />}
            {hasWarnings ? "Create anyway" : "Create drive"}
          </button>
        </>
      }
    >
      <form id="create-drive-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="drive-company">Company</label>
            <select id="drive-company" required value={form.companyId} onChange={(e) => update("companyId", e.target.value)}>
              <option value="">Select company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="drive-job">Role</label>
            <select id="drive-job" required value={form.jobId} onChange={(e) => update("jobId", e.target.value)} disabled={!form.companyId}>
              <option value="">{form.companyId ? "Select role" : "Choose a company first"}</option>
              {companyJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
            {form.companyId && companyJobs.length === 0 && <span className="field-hint">This company hasn't posted any roles yet.</span>}
          </div>

          <div className="field">
            <label htmlFor="drive-date">Starts</label>
            <input id="drive-date" type="datetime-local" required value={form.date} onChange={(e) => update("date", e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="drive-duration">Duration</label>
            <select id="drive-duration" value={form.durationMinutes} onChange={(e) => update("durationMinutes", e.target.value)}>
              {DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="drive-venue">Venue</label>
            <input id="drive-venue" placeholder="e.g. Main Auditorium" value={form.venue} onChange={(e) => update("venue", e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="drive-capacity">Capacity</label>
            <input id="drive-capacity" type="number" min="1" placeholder="e.g. 120" value={form.capacity} onChange={(e) => update("capacity", e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="drive-deadline">Registrations close</label>
            <input id="drive-deadline" type="date" value={form.applicationDeadline} onChange={(e) => update("applicationDeadline", e.target.value)} />
          </div>
        </div>

        {checking && (
          <p className="field-hint row">
            <Spinner /> Checking for clashes
          </p>
        )}
        {!checking && check && check.conflicts.length === 0 && (
          <div className="inline-result is-ok">
            <CircleCheck aria-hidden="true" />
            No clashes with other drives at this time.
          </div>
        )}
        {!checking && check && (
          <ScheduleConflicts
            conflicts={check.conflicts}
            suggestedSlot={check.suggestedSlot}
            onUseSlot={(slot) => update("date", toLocalInputValue(slot))}
          />
        )}

        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Modal>
  );
}

function PlacementDrives() {
  const toast = useToast();

  const [drives, setDrives] = useState([]);
  const [loadedAt, setLoadedAt] = useState(0);
  const [companies, setCompanies] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [conflicts, setConflicts] = useState({});
  const [checkingId, setCheckingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [drivesRes, companiesRes, jobsRes] = await Promise.all([
        api.get("/drives?limit=100"),
        api.get("/companies?limit=100"),
        api.get("/jobs?limit=100"),
      ]);
      setDrives(drivesRes.data ?? []);
      setLoadedAt(Date.now());
      setCompanies(companiesRes.data ?? []);
      setJobs(jobsRes.data ?? []);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load drives");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { upcoming, past } = useMemo(() => {
    const up = drives
      .filter((d) => new Date(d.date).getTime() >= loadedAt && d.status !== "CANCELLED")
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const rest = drives.filter((d) => !up.includes(d)).sort((a, b) => new Date(b.date) - new Date(a.date));
    return { upcoming: up, past: rest };
  }, [drives, loadedAt]);

  const checkConflicts = async (drive) => {
    setCheckingId(drive.id);
    try {
      const res = await api.get(`/drives/${drive.id}/conflicts`);
      setConflicts((prev) => ({ ...prev, [drive.id]: res.data }));
    } catch (err) {
      toast.error(err.message || "Could not check for clashes");
    } finally {
      setCheckingId(null);
    }
  };

  const renderDrive = (drive) => {
    const date = new Date(drive.date);
    const result = conflicts[drive.id];
    const driveClashes = result?.driveConflicts ?? [];
    const interviewClashes = result?.conflicts ?? [];
    return (
      <article key={drive.id} className="card drive-card">
        <div className="date-chip date-chip-lg">
          <span>{date.toLocaleString(undefined, { month: "short" })}</span>
          <strong>{date.getDate()}</strong>
        </div>

        <div className="drive-body">
          <div className="drive-title-row">
            <div>
              <h3>{drive.company?.name ?? "Company"}</h3>
              <p>{drive.job?.title ?? "Role"}</p>
            </div>
            <StatusBadge kind="drive" value={drive.status} />
          </div>

          <div className="meta">
            <span>
              <Clock aria-hidden="true" />
              {formatTime(drive.date)} · {formatDuration(drive.durationMinutes ?? 240)} · {relativeTime(drive.date)}
            </span>
            {drive.venue && (
              <span>
                <MapPin aria-hidden="true" />
                {drive.venue}
              </span>
            )}
            {drive.capacity && (
              <span>
                <Users aria-hidden="true" />
                {drive.capacity} seats
              </span>
            )}
            {drive.applicationDeadline && <span>Registrations close {formatDate(drive.applicationDeadline)}</span>}
          </div>

          {result && (
            <div className="schedule-conflicts">
              {result.conflictCount === 0 ? (
                <div className="inline-result is-ok">
                  <CircleCheck aria-hidden="true" />
                  No venue, student or interview-panel clashes.
                </div>
              ) : (
                <>
                  <ScheduleConflicts conflicts={driveClashes} />
                  {interviewClashes.length > 0 && (
                    <div className="inline-result is-bad">
                      <ShieldAlert aria-hidden="true" />
                      <div>
                        <strong>
                          {interviewClashes.length} interview clash{interviewClashes.length === 1 ? "" : "es"}
                        </strong>
                        <ul>
                          {interviewClashes.map((c, i) => (
                            <li key={i}>
                              {INTERVIEW_CONFLICT_LABELS[c.type] ?? c.type}
                              {c.panel ? ` (${c.panel})` : ""}
                            </li>
                          ))}
                        </ul>
                        <Link to="/placement/interviews">Resolve in Interviews</Link>
                      </div>
                    </div>
                  )}
                </>
              )}
              {result.parallelDrives?.length > 0 && <ScheduleConflicts conflicts={result.parallelDrives} />}
            </div>
          )}

          <div className="drive-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => checkConflicts(drive)} disabled={checkingId === drive.id}>
              {checkingId === drive.id && <Spinner />}
              {result ? "Check again" : "Check for clashes"}
            </button>
            <Link className="btn btn-ghost btn-sm" to={`/placement/pipeline?jobId=${drive.jobId}`}>
              View candidates
            </Link>
          </div>
        </div>
      </article>
    );
  };

  if (loading) return <PageSkeleton cards={3} />;

  return (
    <div className="page">
      <PageHeader
        title="Drives"
        subtitle="Plan on-campus drives. Venue clashes are blocked; overlapping drives that share students are flagged."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus />
            New drive
          </button>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      <h2 className="section-title">
        Upcoming <span className="count">{upcoming.length}</span>
      </h2>
      {upcoming.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No upcoming drives"
          action={
            <button type="button" className="btn btn-secondary" onClick={() => setCreating(true)}>
              Schedule a drive
            </button>
          }
        />
      ) : (
        <div className="stack">{upcoming.map(renderDrive)}</div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="section-title">
            Past and cancelled <span className="count">{past.length}</span>
          </h2>
          <div className="stack is-past">{past.map(renderDrive)}</div>
        </>
      )}

      {creating && (
        <CreateDriveModal
          companies={companies}
          jobs={jobs}
          onClose={() => setCreating(false)}
          onCreated={(drive) => {
            setCreating(false);
            const warnings = (drive?.warnings ?? []).filter((w) => w.severity === "warning").length;
            if (warnings) toast.info(`Drive scheduled with ${warnings} student overlap${warnings === 1 ? "" : "s"} to resolve`);
            else toast.success("Drive scheduled and eligible students notified");
            load();
          }}
        />
      )}
    </div>
  );
}

export default PlacementDrives;
