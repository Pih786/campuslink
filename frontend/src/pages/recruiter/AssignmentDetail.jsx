import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ClipboardCheck, Download, ExternalLink, Lock, LockOpen, Paperclip, UserPlus } from "lucide-react";
import { api, downloadFile } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import Modal from "../../components/common/Modal";
import CandidateChecklist from "../../components/assignments/CandidateChecklist";
import FormattedText from "../../components/common/FormattedText";
import { Alert, Avatar, Badge, Card, EmptyState, PageHeader, PageSkeleton, Spinner } from "../../components/ui";
import { formatDateTime, relativeTime } from "../../lib/format";

const STATUS = {
  ASSIGNED: { label: "Not submitted", tone: "neutral" },
  SUBMITTED: { label: "To review", tone: "warning" },
  REVIEWED: { label: "Reviewed", tone: "success" },
};

function ReviewModal({ submission, maxScore, onClose, onSaved }) {
  const toast = useToast();
  const [score, setScore] = useState(submission?.score ?? "");
  const [feedback, setFeedback] = useState(submission?.feedback ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setScore(submission?.score ?? "");
    setFeedback(submission?.feedback ?? "");
    setError("");
  }, [submission]);

  if (!submission) return null;

  const save = async (e) => {
    e.preventDefault();
    const value = Number(score);
    if (score === "" || Number.isNaN(value) || value < 0 || value > maxScore) {
      return setError(`Enter a score from 0 to ${maxScore}`);
    }
    setBusy(true);
    try {
      const res = await api.post(`/assignments/submissions/${submission.id}/review`, { score: value, feedback });
      toast.success(`Scored ${value}/${maxScore}. The candidate has been notified.`);
      onSaved(res.data);
    } catch (err) {
      setError(err.message || "Could not save the review");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      width={640}
      onClose={onClose}
      title={submission.student.user.fullName}
      subtitle={`Submitted ${formatDateTime(submission.submittedAt)}`}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="review-form" className="btn btn-primary" disabled={busy}>
            {busy && <Spinner />}
            Save score
          </button>
        </>
      }
    >
      <form id="review-form" className="stack" onSubmit={save}>
        {error && <Alert tone="error">{error}</Alert>}
        {submission.answerText && (
          <div className="assignment-instructions">
            <FormattedText text={submission.answerText} className="prose" />
          </div>
        )}
        <div className="assignment-submitted">
          {submission.linkUrl && (
            <a href={submission.linkUrl} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" />
              {submission.linkUrl}
            </a>
          )}
          {submission.fileName && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => downloadFile(`/assignments/submissions/${submission.id}/file`, submission.fileName)}
            >
              <Paperclip />
              {submission.fileName}
              <Download className="icon-trailing" />
            </button>
          )}
        </div>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Score (out of {maxScore})</span>
            <input type="number" min={0} max={maxScore} step="0.5" value={score} onChange={(e) => setScore(e.target.value)} autoFocus />
          </label>
        </div>
        <label className="field">
          <span className="field-label">Feedback for the candidate</span>
          <textarea rows={4} maxLength={4000} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What was good, and what to improve." />
        </label>
      </form>
    </Modal>
  );
}

function AssignmentDetail() {
  const { assignmentId } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/assignments/${assignmentId}`);
      setData(res.data);
    } catch (err) {
      setError(err.message || "Could not load the assignment");
    }
  }, [assignmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async () => {
    setBusy(true);
    try {
      const next = data.status === "OPEN" ? "CLOSED" : "OPEN";
      await api.patch(`/assignments/${assignmentId}`, { status: next });
      setData((d) => ({ ...d, status: next }));
      toast.success(next === "CLOSED" ? "Closed for submissions" : "Reopened");
    } catch (err) {
      toast.error(err.message || "Could not update");
    } finally {
      setBusy(false);
    }
  };

  const addCandidates = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/assignments/${assignmentId}/candidates`, { applicationIds: selected });
      toast.success(`Sent to ${res.data.assigned} more candidate${res.data.assigned === 1 ? "" : "s"}`);
      setAdding(false);
      setSelected([]);
      load();
    } catch (err) {
      toast.error(err.message || "Could not add candidates");
    } finally {
      setBusy(false);
    }
  };

  if (!data) return error ? <div className="page"><Alert tone="error">{error}</Alert></div> : <PageSkeleton cards={2} />;

  const counts = {
    submitted: data.submissions.filter((s) => s.status !== "ASSIGNED").length,
    reviewed: data.submissions.filter((s) => s.status === "REVIEWED").length,
  };
  const reviewed = data.submissions.filter((s) => s.status === "REVIEWED");
  const average = reviewed.length ? reviewed.reduce((sum, s) => sum + s.score, 0) / reviewed.length : null;

  return (
    <div className="page">
      <PageHeader
        back={{ to: "/recruiter/assignments", label: "Assignments" }}
        title={data.title}
        subtitle={`${data.job.title} · due ${formatDateTime(data.dueAt)} (${relativeTime(data.dueAt)}) · out of ${data.maxScore}`}
        actions={
          <>
            {data.status === "OPEN" && (
              <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
                <UserPlus />
                Add candidates
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={toggleStatus} disabled={busy}>
              {data.status === "OPEN" ? <Lock /> : <LockOpen />}
              {data.status === "OPEN" ? "Close" : "Reopen"}
            </button>
          </>
        }
      />

      <div className="stat-grid stat-grid-3">
        <div className="stat">
          <span className="stat-label">Submitted</span>
          <span className="stat-value">
            {counts.submitted}/{data.submissions.length}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Reviewed</span>
          <span className="stat-value">{counts.reviewed}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Average score</span>
          <span className="stat-value">{average == null ? "—" : `${average.toFixed(1)}/${data.maxScore}`}</span>
        </div>
      </div>

      <Card title="Instructions">
        <FormattedText text={data.instructions} className="prose" />
      </Card>

      <Card title="Submissions" flush>
        {data.submissions.length === 0 ? (
          <EmptyState compact icon={ClipboardCheck} title="No candidates yet">
            Add candidates to send them this assignment.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th className="num">Score</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {data.submissions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="cell-person">
                        <Avatar name={s.student.user.fullName} />
                        <div>
                          <div className="cell-title">{s.student.user.fullName}</div>
                          <div className="cell-sub">
                            {[s.student.department, s.student.college?.name].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
                    </td>
                    <td className="muted">{s.submittedAt ? relativeTime(s.submittedAt) : "—"}</td>
                    <td className="num">{s.score == null ? "—" : `${s.score}/${data.maxScore}`}</td>
                    <td className="col-actions">
                      {s.status !== "ASSIGNED" && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReviewing(s)}>
                          {s.status === "REVIEWED" ? "Edit score" : "Review"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {reviewing && (
        <ReviewModal
          submission={reviewing}
          maxScore={data.maxScore}
          onClose={() => setReviewing(null)}
          onSaved={(updated) => {
            setData((d) => ({ ...d, submissions: d.submissions.map((s) => (s.id === updated.id ? updated : s)) }));
            setReviewing(null);
          }}
        />
      )}

      <Modal
        open={adding}
        width={620}
        onClose={() => setAdding(false)}
        title="Add candidates"
        subtitle={`Send “${data.title}” to more candidates for ${data.job.title}.`}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={addCandidates} disabled={busy || selected.length === 0}>
              {busy && <Spinner />}
              Send to {selected.length || ""}
            </button>
          </>
        }
      >
        <CandidateChecklist
          jobId={data.jobId}
          selected={selected}
          onChange={setSelected}
          exclude={data.submissions.map((s) => s.applicationId)}
        />
      </Modal>
    </div>
  );
}

export default AssignmentDetail;
