import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LifeBuoy } from "lucide-react";
import { api } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import Modal from "../common/Modal";
import { Alert, Avatar, Badge, EmptyState, Spinner } from "../ui";
import { relativeTime } from "../../lib/format";

export const ESCALATION_STATUS = {
  OPEN: { label: "Open", tone: "warning" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  RESOLVED: { label: "Resolved", tone: "success" },
};

const FILTERS = [
  { key: "active", label: "Active" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "all", label: "All" },
];

// Mirrors RISK_LEVELS in backend/src/modules/analytics/risk.ts.
export function riskLevel(score) {
  if (score == null) return null;
  return score >= 50 ? "High" : score >= 25 ? "Medium" : "Low";
}

export function RiskBadge({ level, score }) {
  if (!level) return null;
  const tone = level === "High" ? "danger" : level === "Medium" ? "warning" : "neutral";
  return (
    <Badge tone={tone}>
      {level} risk{score != null ? ` · ${score}` : ""}
    </Badge>
  );
}

// Escalations for the caller: a mentor sees the ones assigned to them, the
// placement office sees every escalation at the college.
function EscalationList({ studentLink }) {
  const toast = useToast();
  const [filter, setFilter] = useState("active");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState(null);
  const [resolution, setResolution] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/mentoring/escalations");
      setRows(res.data ?? []);
    } catch (err) {
      setError(err.message || "Could not load escalations");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (row, status, note) => {
    setBusyId(row.id);
    try {
      const res = await api.patch(`/mentoring/escalations/${row.id}`, { status, ...(note ? { resolution: note } : {}) });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...res.data } : r)));
      toast.success(status === "RESOLVED" ? "Marked resolved" : "Marked in progress");
      return true;
    } catch (err) {
      toast.error(err.message || "Could not update");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  if (!rows) {
    return error ? (
      <Alert tone="error">{error}</Alert>
    ) : (
      <div className="card-loading">
        <Spinner />
      </div>
    );
  }

  const visible = rows.filter((r) =>
    filter === "all" ? true : filter === "active" ? r.status !== "RESOLVED" : r.status === filter
  );

  return (
    <div className="stack">
      <div className="tabs" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" role="tab" className="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
            <span className="tab-count">
              {rows.filter((r) => (f.key === "all" ? true : f.key === "active" ? r.status !== "RESOLVED" : r.status === f.key)).length}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={LifeBuoy} compact title={filter === "active" ? "No active escalations" : "Nothing here"}>
          {filter === "active" ? "Students the placement office escalates for support appear here." : null}
        </EmptyState>
      ) : (
        <ul className="escalation-list">
          {visible.map((r) => (
            <li key={r.id} className="card escalation">
              <div className="escalation-head">
                <div className="cell-person">
                  <Avatar name={r.student.user.fullName} />
                  <div>
                    <Link className="cell-title" to={studentLink(r.student.id)}>
                      {r.student.user.fullName}
                    </Link>
                    <div className="cell-sub">
                      {[r.student.department, r.student.cgpa ? `CGPA ${r.student.cgpa}` : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
                <div className="row-tight">
                  {r.riskScore != null && <RiskBadge level={riskLevel(r.riskScore)} score={r.riskScore} />}
                  <Badge tone={ESCALATION_STATUS[r.status].tone}>{ESCALATION_STATUS[r.status].label}</Badge>
                </div>
              </div>

              <p className="escalation-reason">{r.reason}</p>

              {Array.isArray(r.factors) && r.factors.length > 0 && (
                <ul className="escalation-factors">
                  {r.factors.slice(0, 4).map((f, i) => (
                    <li key={i}>{f.reason}</li>
                  ))}
                </ul>
              )}

              {r.resolution && r.status === "RESOLVED" && (
                <p className="escalation-resolution">
                  <strong>Resolution:</strong> {r.resolution}
                </p>
              )}

              <div className="escalation-foot">
                <span className="muted">
                  Raised {relativeTime(r.createdAt)}
                  {r.raisedBy ? ` by ${r.raisedBy.fullName}` : ""}
                  {r.mentor ? ` · mentor ${r.mentor.fullName}` : ""}
                </span>
                {r.status !== "RESOLVED" && (
                  <div className="row-tight">
                    {r.status === "OPEN" && (
                      <button type="button" className="btn btn-secondary btn-sm" disabled={busyId === r.id} onClick={() => update(r, "IN_PROGRESS")}>
                        Start working
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busyId === r.id}
                      onClick={() => {
                        setResolution("");
                        setResolving(r);
                      }}
                    >
                      Resolve
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(resolving)}
        onClose={() => setResolving(null)}
        title="Resolve escalation"
        subtitle={resolving ? `What changed for ${resolving.student.user.fullName}?` : ""}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setResolving(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!resolution.trim() || busyId === resolving?.id}
              onClick={async () => {
                if (await update(resolving, "RESOLVED", resolution.trim())) setResolving(null);
              }}
            >
              Mark resolved
            </button>
          </>
        }
      >
        <label className="field">
          <span className="field-label">Resolution note</span>
          <textarea
            rows={4}
            maxLength={1000}
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            placeholder="e.g. Completed profile, cleared the SQL assessment, applied to 3 roles."
            autoFocus
          />
          <span className="field-hint">The placement office sees this note.</span>
        </label>
      </Modal>
    </div>
  );
}

export default EscalationList;
