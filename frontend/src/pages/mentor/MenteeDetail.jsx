import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarClock, Mail, Mic, NotebookPen, Plus, Send } from "lucide-react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import ResumeButton from "../../components/common/ResumeButton";
import MockInterviewModal from "../../components/mock-interviews/MockInterviewModal";
import MockInterviewScores, { scoreTone } from "../../components/mock-interviews/MockInterviewScores";
import { ESCALATION_STATUS, RiskBadge } from "../../components/mentoring/EscalationList";
import { Alert, Badge, Card, EmptyState, PageHeader, PageSkeleton, Spinner, StatusBadge } from "../../components/ui";
import { formatDate, formatDateTime, formatLpa, relativeTime } from "../../lib/format";

const LEARNING_LABEL = { SAVED: "Saved", IN_PROGRESS: "In progress", COMPLETED: "Completed" };

function NoteForm({ studentId, onAdded }) {
  const toast = useToast();
  const [body, setBody] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (body.trim().length < 2) return;
    setBusy(true);
    try {
      const res = await api.post(`/mentoring/students/${studentId}/notes`, {
        body: body.trim(),
        ...(followUp ? { followUpAt: new Date(`${followUp}T10:00:00`).toISOString() } : {}),
      });
      onAdded(res.data);
      setBody("");
      setFollowUp("");
      toast.success("Note added");
    } catch (err) {
      toast.error(err.message || "Could not add the note");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack note-form" onSubmit={submit}>
      <textarea
        rows={3}
        maxLength={2000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What you discussed, what they'll do next."
        aria-label="New note"
      />
      <div className="row">
        <label className="field note-followup">
          <span className="field-label">Follow up on (optional)</span>
          <input type="date" value={followUp} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setFollowUp(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy || body.trim().length < 2}>
          {busy ? <Spinner /> : <Send />}
          Add note
        </button>
      </div>
    </form>
  );
}

function MenteeDetail() {
  const { studentId } = useParams();
  const { user } = useAuth();
  const [student, setStudent] = useState(null);
  const [notes, setNotes] = useState([]);
  const [mocks, setMocks] = useState([]);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const isMentor = user?.role === "MENTOR";

  const load = useCallback(async () => {
    try {
      const [s, n, m] = await Promise.all([
        api.get(`/mentoring/students/${studentId}`),
        api.get(`/mentoring/students/${studentId}/notes`),
        api.get(`/mock-interviews?studentId=${studentId}`),
      ]);
      setStudent(s.data);
      setNotes(n.data ?? []);
      setMocks(m.data ?? []);
    } catch (err) {
      setError(err.message || "Could not load this student");
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!student) return error ? <div className="page"><Alert tone="error">{error}</Alert></div> : <PageSkeleton stats={3} cards={2} />;

  const back = isMentor ? { to: "/mentor/mentees", label: "Mentees" } : { to: "/placement/mentoring", label: "Mentoring" };
  const placed = student.offers.some((o) => o.acceptanceStatus === "ACCEPTED");
  const completed = student.learning.filter((l) => l.status === "COMPLETED").length;

  return (
    <div className="page">
      <PageHeader
        back={back}
        title={student.user.fullName}
        subtitle={[student.department, student.graduationYear && `Class of ${student.graduationYear}`, student.cgpa ? `CGPA ${student.cgpa}` : null]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <a className="btn btn-secondary" href={`mailto:${student.user.email}`}>
              <Mail />
              Email
            </a>
            {student.resumeUrl && <ResumeButton studentId={student.id} name={student.user.fullName} />}
          </>
        }
      />

      <div className="stat-grid">
        <div className="stat">
          <span className="stat-label">Profile</span>
          <span className="stat-value">{student.profileCompletion}%</span>
          <div className="progress" aria-hidden="true">
            <span style={{ width: `${student.profileCompletion}%` }} />
          </div>
        </div>
        <div className="stat">
          <span className="stat-label">Applications</span>
          <span className="stat-value">{student.applications.length}</span>
          <span className="stat-meta">{placed ? "Placed" : `${student.offers.length} offer${student.offers.length === 1 ? "" : "s"}`}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Learning</span>
          <span className="stat-value">{completed}</span>
          <span className="stat-meta">completed of {student.learning.length} tracked</span>
        </div>
        <div className="stat">
          <span className="stat-label">Risk</span>
          <span className="stat-value stat-value-sm">
            {student.risk ? <RiskBadge level={student.risk.level} score={student.risk.score} /> : placed ? "Placed" : "Low"}
          </span>
          {student.mentor && <span className="stat-meta">Mentor: {student.mentor.fullName}</span>}
        </div>
      </div>

      {student.risk?.factors?.length > 0 && (
        <Alert tone="warning">
          <strong>Why this student may need support</strong>
          <ul className="plain-list">
            {student.risk.factors.map((f, i) => (
              <li key={i}>{f.reason}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="split">
        <div className="stack">
          <Card title="Notes and follow-ups" subtitle="Shared between the mentor and the placement office.">
            <NoteForm studentId={student.id} onAdded={(note) => setNotes((prev) => [note, ...prev])} />
            {notes.length === 0 ? (
              <EmptyState compact icon={NotebookPen}>No notes yet.</EmptyState>
            ) : (
              <ol className="note-timeline">
                {notes.map((n) => (
                  <li key={n.id}>
                    <div className="note-meta">
                      <strong>{n.author.fullName}</strong>
                      <span>{relativeTime(n.createdAt)}</span>
                      {n.followUpAt && (
                        <Badge tone={new Date(n.followUpAt) < new Date() ? "neutral" : "info"}>
                          <CalendarClock aria-hidden="true" />
                          Follow up {formatDate(n.followUpAt)}
                        </Badge>
                      )}
                    </div>
                    <p>{n.body}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="Applications" flush>
            {student.applications.length === 0 ? (
              <EmptyState compact>No applications yet.</EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    {student.applications.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <div className="cell-title">{a.job.title}</div>
                          <div className="cell-sub">{a.job.company.name}</div>
                        </td>
                        <td>
                          <StatusBadge kind="application" value={a.status} />
                        </td>
                        <td className="num">{a.matchScore != null ? `${Math.round(a.matchScore)}%` : "—"}</td>
                        <td className="muted">{relativeTime(a.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card
            title="Mock interviews"
            subtitle={mocks[0] ? `Latest ${mocks[0].overallScore}/10 on ${formatDate(mocks[0].conductedAt)}` : "None recorded yet."}
            actions={
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRecording(true)}>
                <Plus />
                Record
              </button>
            }
          >
            {mocks.length === 0 ? (
              <EmptyState compact icon={Mic}>
                A practice round gives the student feedback, and some roles set a minimum score.
              </EmptyState>
            ) : (
              <div className="stack">
                <div className="row-tight">
                  <Badge tone={scoreTone(mocks[0].overallScore)}>
                    <span className="num">{mocks[0].overallScore}/10</span>
                  </Badge>
                  {mocks[0].focus && <span className="muted">{mocks[0].focus}</span>}
                </div>
                <MockInterviewScores interview={mocks[0]} />
                {mocks[0].feedback && <p className="mock-feedback">{mocks[0].feedback}</p>}
                {mocks.length > 1 && (
                  <p className="muted">
                    Earlier: {mocks.slice(1, 4).map((m) => `${m.overallScore} (${formatDate(m.conductedAt)})`).join(", ")}
                  </p>
                )}
              </div>
            )}
          </Card>

          <Card title="Escalations">
            {student.escalations.length === 0 ? (
              <p className="muted">None.</p>
            ) : (
              <ul className="mini-list">
                {student.escalations.map((e) => (
                  <li key={e.id}>
                    <div className="row-tight">
                      <Badge tone={ESCALATION_STATUS[e.status].tone}>{ESCALATION_STATUS[e.status].label}</Badge>
                      <span className="muted">{formatDateTime(e.createdAt)}</span>
                    </div>
                    <p>{e.reason}</p>
                    {e.resolution && <p className="muted">Resolution: {e.resolution}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Skills">
            {student.skills.length === 0 ? (
              <p className="muted">No skills on the profile yet.</p>
            ) : (
              <div className="tag-list">
                {student.skills.map((s) => (
                  <span key={s.id} className="tag">
                    {s.skill.name} <strong className="num">{s.proficiency}</strong>
                    {s.verified && <Badge tone="success">Verified</Badge>}
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Card title="Learning">
            {student.learning.length === 0 ? (
              <p className="muted">Hasn't saved any material yet.</p>
            ) : (
              <ul className="mini-list">
                {student.learning.slice(0, 8).map((l) => (
                  <li key={l.resource.id}>
                    <a href={l.resource.url} target="_blank" rel="noreferrer">
                      {l.resource.title}
                    </a>
                    <span className="muted">
                      {l.resource.skill?.name ? `${l.resource.skill.name} · ` : ""}
                      {LEARNING_LABEL[l.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {student.offers.length > 0 && (
            <Card title="Offers">
              <ul className="mini-list">
                {student.offers.map((o) => (
                  <li key={o.id}>
                    <strong>{o.company.name}</strong>
                    <span className="muted">
                      {formatLpa(o.ctc)} · <StatusBadge kind="offer" value={o.acceptanceStatus} />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {recording && (
        <MockInterviewModal
          open
          student={student}
          onClose={() => setRecording(false)}
          onSaved={(saved) => {
            setMocks((prev) => [saved, ...prev]);
            load();
          }}
        />
      )}
    </div>
  );
}

export default MenteeDetail;
