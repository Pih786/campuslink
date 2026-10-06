import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HeartHandshake, ShieldCheck, UserPlus } from "lucide-react";
import { api } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import Modal from "../../components/common/Modal";
import EscalationList, { ESCALATION_STATUS, RiskBadge } from "../../components/mentoring/EscalationList";
import { MenteeTable } from "../mentor/MentorMentees";
import { Alert, Avatar, Badge, EmptyState, PageHeader, PageSkeleton, Spinner } from "../../components/ui";

const TABS = [
  { key: "risk", label: "At-risk students" },
  { key: "escalations", label: "Escalations" },
  { key: "mentees", label: "Mentored students" },
  { key: "mentors", label: "Mentors" },
];

const studentLink = (id) => `/placement/mentoring/students/${id}`;

function ActionModal({ action, mentors, onClose, onDone }) {
  const toast = useToast();
  const [mentorId, setMentorId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!action) return;
    setMentorId(action.student.mentor?.id ?? "");
    setReason(
      action.type === "escalate"
        ? (action.student.factors ?? []).slice(0, 3).map((f) => f.reason).join(". ") + (action.student.factors?.length ? "." : "")
        : ""
    );
    setError("");
  }, [action]);

  if (!action) return null;
  const escalate = action.type === "escalate";

  const submit = async () => {
    if (!mentorId) return setError("Choose a mentor");
    if (escalate && reason.trim().length < 5) return setError("Say briefly why this student needs support");
    setBusy(true);
    try {
      if (escalate) {
        await api.post("/mentoring/escalations", { studentId: action.student.studentId, reason: reason.trim(), mentorId });
        toast.success("Escalated. The mentor has been notified.");
      } else {
        await api.post("/mentoring/assignments", { studentIds: [action.student.studentId], mentorId });
        toast.success("Mentor assigned");
      }
      onDone();
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={escalate ? "Escalate to a mentor" : "Assign a mentor"}
      subtitle={action.student.name}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || mentors.length === 0}>
            {busy && <Spinner />}
            {escalate ? "Escalate" : "Assign"}
          </button>
        </>
      }
    >
      <div className="stack">
        {error && <Alert tone="error">{error}</Alert>}
        {mentors.length === 0 ? (
          <Alert tone="warning" title="No mentors yet">
            Ask faculty to sign up as a Mentor for your college, then approve them on the Team page.
          </Alert>
        ) : (
          <label className="field">
            <span className="field-label">Mentor</span>
            <select value={mentorId} onChange={(e) => setMentorId(e.target.value)}>
              <option value="">Select a mentor</option>
              {mentors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName} · {m.mentees} mentee{m.mentees === 1 ? "" : "s"}
                  {m.openEscalations ? `, ${m.openEscalations} open` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        {escalate && (
          <label className="field">
            <span className="field-label">What does the student need help with?</span>
            <textarea rows={4} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
            <span className="field-hint">The mentor sees this with the student's current risk factors.</span>
          </label>
        )}
      </div>
    </Modal>
  );
}

function PlacementMentoring() {
  const [tab, setTab] = useState("risk");
  const [queue, setQueue] = useState(null);
  const [mentors, setMentors] = useState([]);
  const [mentees, setMentees] = useState(null);
  const [action, setAction] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [q, m] = await Promise.all([api.get("/mentoring/at-risk"), api.get("/mentoring/mentors")]);
      setQueue(q.data);
      setMentors(m.data ?? []);
    } catch (err) {
      setError(err.message || "Could not load mentoring");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab !== "mentees") return;
    api
      .get("/mentoring/mentees")
      .then((res) => setMentees(res.data ?? []))
      .catch((err) => setError(err.message || "Could not load mentored students"));
  }, [tab]);

  if (!queue && !error) return <PageSkeleton cards={2} />;

  return (
    <div className="page">
      <PageHeader
        title="Mentoring"
        subtitle="Pair students who are falling behind with a faculty mentor, and follow each escalation to resolution."
      />
      {error && <Alert tone="error">{error}</Alert>}

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" className="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === "risk" && queue && <span className="tab-count">{queue.total}</span>}
            {t.key === "mentors" && <span className="tab-count">{mentors.length}</span>}
          </button>
        ))}
      </div>

      {tab === "risk" && queue && (
        <div className="card card-flush">
          {queue.students.length === 0 ? (
            <EmptyState icon={ShieldCheck} compact title="No students flagged">
              Unplaced students with medium or high placement risk will appear here.
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Risk</th>
                    <th>Why</th>
                    <th>Mentor</th>
                    <th className="col-actions" />
                  </tr>
                </thead>
                <tbody>
                  {queue.students.map((s) => (
                    <tr key={s.studentId}>
                      <td>
                        <div className="cell-person">
                          <Avatar name={s.name} />
                          <div>
                            <Link className="cell-title" to={studentLink(s.studentId)}>
                              {s.name}
                            </Link>
                            <div className="cell-sub">{[s.branch, s.cgpa ? `CGPA ${s.cgpa}` : null].filter(Boolean).join(" · ")}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <RiskBadge level={s.level} score={s.score} />
                      </td>
                      <td className="cell-wrap">
                        <span className="cell-sub">{s.factors.slice(0, 2).map((f) => f.reason).join("; ")}</span>
                      </td>
                      <td>
                        {s.mentor ? s.mentor.fullName : <span className="muted">None</span>}
                        {s.escalation && (
                          <div>
                            <Badge tone={ESCALATION_STATUS[s.escalation.status].tone}>
                              Escalated · {ESCALATION_STATUS[s.escalation.status].label.toLowerCase()}
                            </Badge>
                          </div>
                        )}
                      </td>
                      <td className="col-actions">
                        <div className="row-tight">
                          {!s.mentor && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAction({ type: "assign", student: s })}>
                              <UserPlus />
                              Assign
                            </button>
                          )}
                          {!s.escalation && (
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAction({ type: "escalate", student: s })}>
                              <HeartHandshake />
                              Escalate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "escalations" && <EscalationList studentLink={studentLink} />}

      {tab === "mentees" &&
        (mentees === null ? (
          <div className="skeleton skeleton-card" />
        ) : mentees.length === 0 ? (
          <EmptyState icon={HeartHandshake} title="No students have a mentor yet">
            Assign mentors from the at-risk list.
          </EmptyState>
        ) : (
          <div className="card card-flush">
            <MenteeTable mentees={mentees} showMentor linkFor={studentLink} />
          </div>
        ))}

      {tab === "mentors" && (
        <div className="card card-flush">
          {mentors.length === 0 ? (
            <EmptyState icon={HeartHandshake} compact title="No mentors yet">
              Faculty can sign up with the Mentor role and your college. Approve them on the{" "}
              <Link to="/placement/team">Team</Link> page.
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Mentor</th>
                    <th className="num">Mentees</th>
                    <th className="num">Open escalations</th>
                  </tr>
                </thead>
                <tbody>
                  {mentors.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div className="cell-person">
                          <Avatar name={m.fullName} />
                          <div>
                            <div className="cell-title">{m.fullName}</div>
                            <div className="cell-sub">{m.designation || m.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="num">{m.mentees}</td>
                      <td className="num">{m.openEscalations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ActionModal
        action={action}
        mentors={mentors}
        onClose={() => setAction(null)}
        onDone={() => {
          setAction(null);
          load();
        }}
      />
    </div>
  );
}

export default PlacementMentoring;
