import { useState } from "react";
import { CalendarX2 } from "lucide-react";
import Modal from "../common/Modal";
import { Alert, Spinner } from "../ui";
import { api } from "../../services/api";
import { formatDateTime, toLocalInputValue } from "../../lib/format";

const ROUNDS = ["Technical", "Managerial", "HR", "Final", "Assessment"];
const DURATIONS = [30, 45, 60, 90];

function defaultSlot() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toLocalInputValue(d);
}

// Pass `application` to schedule a new interview, or `interview` to
// reschedule an existing one (same form, PATCH instead of POST).
function ScheduleInterviewModal({ open, application, interview, onClose, onDone }) {
  const isReschedule = Boolean(interview);

  const [form, setForm] = useState(() => ({
    round: interview?.round ?? "Technical",
    scheduledAt: interview ? toLocalInputValue(interview.scheduledAt) : defaultSlot(),
    duration: interview?.duration ?? 30,
    panel: interview?.panel ?? "",
    venue: interview?.venue ?? "",
    meetingUrl: interview?.meetingUrl ?? "",
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [suggestedSlot, setSuggestedSlot] = useState(null);

  const studentName =
    application?.student?.user?.fullName ??
    interview?.application?.student?.user?.fullName ??
    "candidate";

  const clearFeedback = () => {
    setError("");
    setConflict(false);
    setSuggestedSlot(null);
  };

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    clearFeedback();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    clearFeedback();

    const payload = {
      round: form.round,
      scheduledAt: new Date(form.scheduledAt).toISOString(),
      duration: Number(form.duration),
      panel: form.panel || undefined,
      venue: form.venue || undefined,
      meetingUrl: form.meetingUrl || undefined,
    };

    try {
      if (isReschedule) {
        await api.patch(`/interviews/${interview.id}`, { ...payload, status: "SCHEDULED" });
      } else {
        await api.post("/interviews", { ...payload, applicationId: application.id });
      }
      onDone?.();
    } catch (err) {
      if (err.code === "INTERVIEW_CONFLICT") {
        setConflict(true);
        setError("That slot clashes with another interview for this candidate or panel.");
        setSuggestedSlot(err.details?.suggestedSlot ?? null);
      } else {
        setError(err.message || "Could not schedule interview");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isReschedule ? "Reschedule interview" : "Schedule interview"}
      subtitle={`with ${studentName}`}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="schedule-interview-form" className="btn btn-primary" disabled={submitting}>
            {submitting && <Spinner />}
            {isReschedule ? "Reschedule" : "Schedule"}
          </button>
        </>
      }
    >
      <form id="schedule-interview-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="iv-round">Round</label>
            <select id="iv-round" value={form.round} onChange={(e) => update("round", e.target.value)}>
              {ROUNDS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="iv-duration">Duration</label>
            <select id="iv-duration" value={form.duration} onChange={(e) => update("duration", e.target.value)}>
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d} minutes
                </option>
              ))}
            </select>
          </div>

          <div className="field span-2">
            <label htmlFor="iv-when">Date and time</label>
            <input
              id="iv-when"
              type="datetime-local"
              required
              value={form.scheduledAt}
              onChange={(e) => update("scheduledAt", e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="iv-panel">Panel</label>
            <input id="iv-panel" placeholder="e.g. Panel A" value={form.panel} onChange={(e) => update("panel", e.target.value)} />
            <span className="field-hint">Used to prevent double-booking a panel</span>
          </div>

          <div className="field">
            <label htmlFor="iv-venue">Venue</label>
            <input id="iv-venue" placeholder="e.g. Seminar Hall 2" value={form.venue} onChange={(e) => update("venue", e.target.value)} />
          </div>

          <div className="field span-2">
            <label htmlFor="iv-link">Meeting link</label>
            <input
              id="iv-link"
              type="url"
              placeholder="Optional, e.g. https://meet.example.com/abc"
              value={form.meetingUrl}
              onChange={(e) => update("meetingUrl", e.target.value)}
            />
          </div>
        </div>

        {error && !conflict && <Alert tone="error">{error}</Alert>}

        {conflict && (
          <div className="alert alert-warning conflict-alert" role="alert">
            <CalendarX2 aria-hidden="true" />
            <div className="alert-body">
              <strong>Scheduling clash</strong>
              <p>{error}</p>
              {suggestedSlot && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => update("scheduledAt", toLocalInputValue(suggestedSlot))}
                >
                  Use next free slot · {formatDateTime(suggestedSlot)}
                </button>
              )}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

export default ScheduleInterviewModal;
