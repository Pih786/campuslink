import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ClipboardList, Plus } from "lucide-react";
import { api } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import Modal from "../../components/common/Modal";
import CandidateChecklist from "../../components/assignments/CandidateChecklist";
import { Alert, Badge, EmptyState, PageHeader, PageSkeleton, Spinner } from "../../components/ui";
import { formatDateTime, toLocalInputValue } from "../../lib/format";

const EMPTY_FORM = { jobId: "", title: "", instructions: "", dueAt: "", maxScore: 100 };

function defaultDue() {
  const d = new Date(Date.now() + 3 * 86400000);
  d.setHours(23, 59, 0, 0);
  return toLocalInputValue(d);
}

export function NewAssignmentModal({ open, onClose, jobs, initialJobId, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_FORM, jobId: initialJobId ?? "", dueAt: defaultDue() });
      setSelected([]);
      setError("");
    }
  }, [open, initialJobId]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.jobId) return setError("Choose the job this assignment is for");
    if (form.title.trim().length < 3) return setError("Give the assignment a title");
    if (form.instructions.trim().length < 10) return setError("Describe what candidates should do");
    if (!form.dueAt || new Date(form.dueAt) <= new Date()) return setError("Set a due date in the future");
    setBusy(true);
    setError("");
    try {
      const res = await api.post("/assignments", {
        jobId: form.jobId,
        title: form.title.trim(),
        instructions: form.instructions.trim(),
        dueAt: new Date(form.dueAt).toISOString(),
        maxScore: Number(form.maxScore) || 100,
        applicationIds: selected,
      });
      toast.success(
        res.data.assigned ? `Sent to ${res.data.assigned} candidate${res.data.assigned > 1 ? "s" : ""}` : "Assignment created"
      );
      onCreated(res.data);
    } catch (err) {
      setError(err.message || "Could not create the assignment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={640}
      title="New assignment"
      subtitle="A take-home task for candidates of one role. Candidates are notified and their application moves to Assessment."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="new-assignment" className="btn btn-primary" disabled={busy}>
            {busy && <Spinner />}
            {selected.length ? `Send to ${selected.length}` : "Create"}
          </button>
        </>
      }
    >
      <form id="new-assignment" className="stack" onSubmit={submit}>
        {error && <Alert tone="error">{error}</Alert>}
        <label className="field">
          <span className="field-label">Job</span>
          <select
            value={form.jobId}
            onChange={(e) => {
              set("jobId")(e);
              setSelected([]);
            }}
          >
            <option value="">Select a job</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Title</span>
          <input value={form.title} onChange={set("title")} placeholder="e.g. Build a small REST API" maxLength={160} />
        </label>
        <label className="field">
          <span className="field-label">Instructions</span>
          <textarea
            rows={6}
            value={form.instructions}
            onChange={set("instructions")}
            maxLength={8000}
            placeholder={"What to build or answer, how it's judged, and how to submit.\n- Use bullets with a leading dash"}
          />
        </label>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Due</span>
            <input type="datetime-local" value={form.dueAt} onChange={set("dueAt")} />
          </label>
          <label className="field">
            <span className="field-label">Scored out of</span>
            <input type="number" min={1} max={1000} value={form.maxScore} onChange={set("maxScore")} />
          </label>
        </div>
        <div className="field">
          <span className="field-label">Send to</span>
          <CandidateChecklist jobId={form.jobId} selected={selected} onChange={setSelected} />
        </div>
      </form>
    </Modal>
  );
}

function RecruiterAssignments() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [assignments, setAssignments] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");
  const newForJob = params.get("new");

  useEffect(() => {
    Promise.all([api.get("/assignments"), api.get("/jobs?limit=100")])
      .then(([a, j]) => {
        setAssignments(a.data ?? []);
        setJobs((j.data ?? []).filter((job) => job.status !== "CLOSED"));
      })
      .catch((err) => setError(err.message || "Could not load assignments"));
  }, []);

  if (!assignments && !error) return <PageSkeleton cards={1} />;

  const closeModal = () => setParams({}, { replace: true });

  return (
    <div className="page">
      <PageHeader
        title="Assignments"
        subtitle="Take-home tasks for your candidates, with submissions and scores in one place."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setParams({ new: "1" })}>
            <Plus />
            New assignment
          </button>
        }
      />
      {error && <Alert tone="error">{error}</Alert>}

      <div className="card card-flush">
        {assignments?.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No assignments yet" compact>
            Send a take-home task to shortlisted candidates to see how they work.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Assignment</th>
                  <th>Due</th>
                  <th className="num">Sent</th>
                  <th className="num">Submitted</th>
                  <th className="num">Reviewed</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(assignments ?? []).map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link className="cell-title" to={`/recruiter/assignments/${a.id}`}>
                        {a.title}
                      </Link>
                      <div className="cell-sub">{a.job.title}</div>
                    </td>
                    <td className="muted">{formatDateTime(a.dueAt)}</td>
                    <td className="num">{a.counts.assigned}</td>
                    <td className="num">{a.counts.submitted}</td>
                    <td className="num">
                      {a.counts.reviewed}
                      {a.counts.submitted > a.counts.reviewed && (
                        <>
                          {" "}
                          <Badge tone="warning">{a.counts.submitted - a.counts.reviewed} to review</Badge>
                        </>
                      )}
                    </td>
                    <td>
                      {a.status === "CLOSED" ? (
                        <Badge>Closed</Badge>
                      ) : new Date(a.dueAt) < new Date() ? (
                        <Badge>Past due</Badge>
                      ) : (
                        <Badge tone="success">Open</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewAssignmentModal
        open={Boolean(newForJob)}
        onClose={closeModal}
        jobs={jobs}
        initialJobId={newForJob && newForJob !== "1" ? newForJob : ""}
        onCreated={(created) => navigate(`/recruiter/assignments/${created.id}`)}
      />
    </div>
  );
}

export default RecruiterAssignments;
