import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, CalendarClock, ExternalLink, MapPin, UserX, Users } from "lucide-react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { dayLabel, formatTime } from "../../lib/format";
import AnimatedNumber from "../../components/common/AnimatedNumber";
import Modal from "../../components/common/Modal";
import ScheduleInterviewModal from "../../components/pipeline/ScheduleInterviewModal";
import { Alert, Avatar, EmptyState, PageHeader, PageSkeleton, Spinner, StatCard, StatusBadge } from "../../components/ui";

function OutcomeModal({ interview, onClose, onDone }) {
  const [status, setStatus] = useState("COMPLETED");
  const [score, setScore] = useState(7);
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await api.patch(`/interviews/${interview.id}`, {
        status,
        score: status === "COMPLETED" ? Number(score) : undefined,
        feedback: feedback || undefined,
      });
      onDone();
    } catch (err) {
      setError(err.message || "Could not save the outcome");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Record outcome"
      subtitle={`${interview.application?.student?.user?.fullName ?? "Candidate"} · ${interview.round ?? "Interview"} round`}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving && <Spinner />}
            Save outcome
          </button>
        </>
      }
    >
      <div className="segmented" role="group" aria-label="Attendance">
        <button type="button" aria-pressed={status === "COMPLETED"} onClick={() => setStatus("COMPLETED")}>
          <CalendarCheck aria-hidden="true" />
          Attended
        </button>
        <button type="button" aria-pressed={status === "NO_SHOW"} onClick={() => setStatus("NO_SHOW")}>
          <UserX aria-hidden="true" />
          No-show
        </button>
      </div>

      {status === "COMPLETED" && (
        <div className="field">
          <div className="field-label-row">
            <label htmlFor="outcome-score">Score</label>
            <strong className="num score-readout">{Number(score).toFixed(1)} / 10</strong>
          </div>
          <input
            id="outcome-score"
            type="range"
            min="0"
            max="10"
            step="0.5"
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
        </div>
      )}

      <div className="field">
        <label htmlFor="outcome-feedback">Feedback</label>
        <textarea
          id="outcome-feedback"
          placeholder="Strengths, concerns and your recommendation"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
      </div>

      {error && <Alert tone="error">{error}</Alert>}
    </Modal>
  );
}

function InterviewsManager() {
  const { user } = useAuth();
  const toast = useToast();
  const isRecruiter = user?.role === "RECRUITER";
  const pipelinePath = isRecruiter ? "/recruiter/pipeline" : "/placement/pipeline";

  const [interviews, setInterviews] = useState([]);
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("upcoming");
  const [outcomeFor, setOutcomeFor] = useState(null);
  const [rescheduleFor, setRescheduleFor] = useState(null);
  const [cancelFor, setCancelFor] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/interviews?limit=100");
      setInterviews(res.data ?? []);
      setLoadedAt(Date.now());
      setError("");
    } catch (err) {
      setError(err.message || "Could not load interviews");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { upcoming, past, stats } = useMemo(() => {
    const up = [];
    const done = [];
    for (const iv of interviews) {
      const isFuture = new Date(iv.scheduledAt).getTime() + iv.duration * 60000 >= loadedAt;
      if (iv.status === "SCHEDULED" && isFuture) up.push(iv);
      else done.push(iv);
    }
    up.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    done.sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));

    const todayLabel = dayLabel(new Date(loadedAt));
    const completed = interviews.filter((iv) => iv.status === "COMPLETED").length;
    const noShow = interviews.filter((iv) => iv.status === "NO_SHOW").length;
    const attendedBase = completed + noShow;

    return {
      upcoming: up,
      past: done,
      stats: {
        today: up.filter((iv) => dayLabel(iv.scheduledAt) === todayLabel).length,
        upcoming: up.length,
        completed,
        noShowRate: attendedBase ? Math.round((noShow / attendedBase) * 100) : 0,
      },
    };
  }, [interviews, loadedAt]);

  const list = tab === "upcoming" ? upcoming : past;

  const grouped = useMemo(() => {
    const groups = [];
    for (const iv of list) {
      const label = dayLabel(iv.scheduledAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(iv);
      else groups.push({ label, items: [iv] });
    }
    return groups;
  }, [list]);

  const handleCancelInterview = async () => {
    const iv = cancelFor;
    setCancelFor(null);
    try {
      await api.patch(`/interviews/${iv.id}`, { status: "CANCELLED" });
      toast.success("Interview cancelled");
      load();
    } catch (err) {
      toast.error(err.message || "Could not cancel the interview");
    }
  };

  if (loading) return <PageSkeleton stats={4} cards={2} />;

  return (
    <div className="page">
      <PageHeader
        title="Interviews"
        subtitle={isRecruiter ? "Every round for your company's roles." : "Every interview round across campus."}
      />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="stat-grid">
        <StatCard label="Today" value={<AnimatedNumber value={stats.today} />} />
        <StatCard label="Upcoming" value={<AnimatedNumber value={stats.upcoming} />} />
        <StatCard label="Completed" value={<AnimatedNumber value={stats.completed} />} />
        <StatCard
          label="No-show rate"
          value={
            <>
              <AnimatedNumber value={stats.noShowRate} />
              <small>%</small>
            </>
          }
          meta="No-shows ÷ attended + no-shows"
        />
      </div>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" className="tab" aria-selected={tab === "upcoming"} onClick={() => setTab("upcoming")}>
          Upcoming <span className="tab-count">{upcoming.length}</span>
        </button>
        <button type="button" role="tab" className="tab" aria-selected={tab === "past"} onClick={() => setTab("past")}>
          Past and closed <span className="tab-count">{past.length}</span>
        </button>
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={tab === "upcoming" ? "Nothing scheduled" : "No past interviews"}
          action={
            tab === "upcoming" && (
              <Link className="btn btn-secondary" to={pipelinePath}>
                Schedule from the pipeline
              </Link>
            )
          }
        >
          {tab === "upcoming" ? "Shortlisted candidates can be scheduled from their pipeline card." : null}
        </EmptyState>
      ) : (
        grouped.map((group) => (
          <section key={group.label} className="day-group">
            <h2 className="section-title">{group.label}</h2>
            <div className="card card-flush">
              <ul className="agenda">
                {group.items.map((iv) => {
                  const student = iv.application?.student;
                  const name = student?.user?.fullName ?? "Candidate";
                  return (
                    <li key={iv.id} className="agenda-row">
                      <div className="agenda-time">
                        <strong className="num">{formatTime(iv.scheduledAt)}</strong>
                        <span>{iv.duration} min</span>
                      </div>

                      <div className="agenda-main">
                        <div className="cell-person">
                          <Avatar name={name} size="sm" />
                          <div>
                            <div className="cell-title">{name}</div>
                            <div className="cell-sub">
                              {iv.application?.job?.title ?? "Role"}
                              {!isRecruiter && iv.application?.job?.company?.name ? ` · ${iv.application.job.company.name}` : ""}
                            </div>
                          </div>
                        </div>

                        <div className="meta">
                          <span>{iv.round ?? "Interview"} round</span>
                          {iv.panel && (
                            <span>
                              <Users aria-hidden="true" />
                              {iv.panel}
                            </span>
                          )}
                          {iv.venue && (
                            <span>
                              <MapPin aria-hidden="true" />
                              {iv.venue}
                            </span>
                          )}
                          {iv.meetingUrl && (
                            <a href={iv.meetingUrl} target="_blank" rel="noreferrer">
                              <ExternalLink aria-hidden="true" />
                              Meeting link
                            </a>
                          )}
                        </div>

                        {iv.status === "COMPLETED" && (iv.score != null || iv.feedback) && (
                          <p className="agenda-feedback">
                            {iv.score != null && <strong className="num">{iv.score}/10</strong>}
                            {iv.feedback && <span>{iv.feedback}</span>}
                          </p>
                        )}
                      </div>

                      <div className="agenda-side">
                        <StatusBadge kind="interview" value={iv.status} />
                        {iv.status === "SCHEDULED" && (
                          <div className="row">
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOutcomeFor(iv)}>
                              Record outcome
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRescheduleFor(iv)}>
                              Reschedule
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm btn-danger-ghost" onClick={() => setCancelFor(iv)}>
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        ))
      )}

      {outcomeFor && (
        <OutcomeModal
          interview={outcomeFor}
          onClose={() => setOutcomeFor(null)}
          onDone={() => {
            setOutcomeFor(null);
            toast.success("Outcome recorded");
            load();
          }}
        />
      )}

      {rescheduleFor && (
        <ScheduleInterviewModal
          open
          interview={rescheduleFor}
          onClose={() => setRescheduleFor(null)}
          onDone={() => {
            setRescheduleFor(null);
            toast.success("Interview rescheduled");
            load();
          }}
        />
      )}

      <Modal
        open={Boolean(cancelFor)}
        onClose={() => setCancelFor(null)}
        title="Cancel this interview?"
        subtitle={cancelFor?.application?.student?.user?.fullName}
        width={420}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setCancelFor(null)}>
              Keep it
            </button>
            <button type="button" className="btn btn-danger" onClick={handleCancelInterview}>
              Cancel interview
            </button>
          </>
        }
      >
        <p className="modal-text">The slot is freed for other candidates and panels.</p>
      </Modal>
    </div>
  );
}

export default InterviewsManager;
