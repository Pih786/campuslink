import { useEffect, useState } from "react";
import { ClipboardList, Download, ExternalLink, Paperclip, Send } from "lucide-react";
import { api, downloadFile } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { Alert, Badge, EmptyState, PageHeader, PageSkeleton, Spinner } from "../../components/ui";
import FormattedText from "../../components/common/FormattedText";
import { formatDateTime, relativeTime } from "../../lib/format";

const STATUS = {
  ASSIGNED: { label: "To do", tone: "warning" },
  SUBMITTED: { label: "Submitted", tone: "info" },
  REVIEWED: { label: "Reviewed", tone: "success" },
};

function isClosed(s) {
  return s.assignment.status === "CLOSED" || new Date(s.assignment.dueAt) < new Date();
}

function SubmissionForm({ submission, onSubmitted }) {
  const toast = useToast();
  const [answerText, setAnswerText] = useState(submission.answerText ?? "");
  const [linkUrl, setLinkUrl] = useState(submission.linkUrl ?? "");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!answerText.trim() && !linkUrl.trim() && !file && !submission.fileName) {
      setError("Add an answer, a link or a file");
      return;
    }
    const form = new FormData();
    form.append("answerText", answerText);
    form.append("linkUrl", linkUrl.trim());
    if (file) form.append("file", file);
    setBusy(true);
    setError("");
    try {
      const res = await api.postForm(`/assignments/submissions/${submission.id}/submit`, form);
      toast.success("Submitted. The recruiter has been notified.");
      onSubmitted(res.data);
      setFile(null);
    } catch (err) {
      const first = err.details?.details?.[0];
      setError(first ? first.message : err.message || "Could not submit");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack assignment-form" onSubmit={submit}>
      {error && <Alert tone="error">{error}</Alert>}
      <label className="field">
        <span className="field-label">Your answer</span>
        <textarea rows={5} value={answerText} maxLength={20000} onChange={(e) => setAnswerText(e.target.value)} placeholder="Explain your approach, or paste your answer." />
      </label>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Link (repo, notebook, deployed app)</span>
          <input type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://github.com/…" />
        </label>
        <label className="field">
          <span className="field-label">File (optional, up to 15 MB)</span>
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md,.zip,.ipynb,.py,.js,.ts,.java,.cpp,.c,.sql,.png,.jpg,.jpeg"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {submission.fileName && !file && <span className="field-hint">Current file: {submission.fileName}</span>}
        </label>
      </div>
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <Spinner /> : <Send />}
          {submission.status === "SUBMITTED" ? "Update submission" : "Submit"}
        </button>
        <span className="field-hint">You can update your submission until the due date or until it's reviewed.</span>
      </div>
    </form>
  );
}

function AssignmentCard({ submission, onChange }) {
  const [open, setOpen] = useState(submission.status === "ASSIGNED" && !isClosed(submission));
  const a = submission.assignment;
  const status = STATUS[submission.status];
  const closed = isClosed(submission);
  const due = new Date(a.dueAt);
  const dueSoon = !closed && due - Date.now() < 48 * 3600 * 1000;

  return (
    <article className="card assignment-card">
      <div className="assignment-head">
        <div>
          <h2 className="card-title">{a.title}</h2>
          <p className="card-subtitle">
            {a.company.name} · {a.job.title}
          </p>
        </div>
        <div className="row-tight">
          <Badge tone={status.tone}>{status.label}</Badge>
          {closed && submission.status === "ASSIGNED" && <Badge tone="danger">Missed</Badge>}
        </div>
      </div>

      <div className="assignment-facts">
        <span className={dueSoon ? "text-warning" : ""}>
          Due {formatDateTime(a.dueAt)} {!closed && `(${relativeTime(a.dueAt)})`}
        </span>
        <span>Out of {a.maxScore}</span>
        {submission.submittedAt && <span>Submitted {relativeTime(submission.submittedAt)}</span>}
      </div>

      {submission.status === "REVIEWED" && (
        <div className="assignment-review">
          <div className="assignment-score">
            <strong className="num">{submission.score}</strong>
            <span>/ {a.maxScore}</span>
          </div>
          {submission.feedback && <p>{submission.feedback}</p>}
        </div>
      )}

      <button type="button" className="copilot-link" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "Hide details" : "Show instructions and your submission"}
      </button>

      {open && (
        <div className="stack">
          <div className="assignment-instructions">
            <FormattedText text={a.instructions} className="prose" />
          </div>
          {submission.status !== "ASSIGNED" && (
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
                  className="btn btn-ghost btn-sm"
                  onClick={() => downloadFile(`/assignments/submissions/${submission.id}/file`, submission.fileName)}
                >
                  <Paperclip />
                  {submission.fileName}
                  <Download className="icon-trailing" />
                </button>
              )}
            </div>
          )}
          {!closed && submission.status !== "REVIEWED" && (
            <SubmissionForm submission={submission} onSubmitted={(updated) => onChange({ ...submission, ...updated })} />
          )}
          {closed && submission.status === "ASSIGNED" && (
            <Alert tone="warning">The due date has passed, so this assignment no longer accepts submissions.</Alert>
          )}
        </div>
      )}
    </article>
  );
}

function StudentAssignments() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/assignments/mine")
      .then((res) => setItems(res.data ?? []))
      .catch((err) => setError(err.message || "Could not load assignments"));
  }, []);

  if (!items && !error) return <PageSkeleton cards={2} />;

  const todo = (items ?? []).filter((s) => s.status === "ASSIGNED" && !isClosed(s)).length;

  return (
    <div className="page">
      <PageHeader
        title="Assignments"
        subtitle={todo ? `${todo} waiting for your submission` : "Take-home tasks companies send as part of their selection process."}
      />
      {error && <Alert tone="error">{error}</Alert>}
      {items?.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No assignments yet">
          When a company sends you a take-home task for a role you applied to, it shows up here.
        </EmptyState>
      ) : (
        <div className="stack">
          {(items ?? []).map((s) => (
            <AssignmentCard key={s.id} submission={s} onChange={(next) => setItems((prev) => prev.map((x) => (x.id === next.id ? next : x)))} />
          ))}
        </div>
      )}
    </div>
  );
}

export default StudentAssignments;
