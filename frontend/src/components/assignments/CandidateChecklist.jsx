import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { Spinner, StatusBadge } from "../ui";

const ASSIGNABLE = ["APPLIED", "ELIGIBLE", "SHORTLISTED", "ASSESSMENT", "INTERVIEW"];

// Candidates of one job who can still receive an assignment.
function CandidateChecklist({ jobId, selected, onChange, exclude = [] }) {
  const [apps, setApps] = useState(null);

  useEffect(() => {
    if (!jobId) return undefined;
    let cancelled = false;
    setApps(null);
    api
      .get(`/applications?jobId=${jobId}&limit=100`)
      .then((res) => {
        if (cancelled) return;
        const list = (res.data ?? [])
          .filter((a) => ASSIGNABLE.includes(a.status) && !exclude.includes(a.id))
          .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
        setApps(list);
      })
      .catch(() => !cancelled && setApps([]));
    return () => {
      cancelled = true;
    };
    // exclude is recomputed by callers on every render; its contents only matter on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  if (!jobId) return <p className="field-hint">Choose a job to see its candidates.</p>;
  if (apps === null) {
    return (
      <div className="videos-loading">
        <Spinner /> Loading candidates
      </div>
    );
  }
  if (apps.length === 0) return <p className="field-hint">No candidates for this job can receive an assignment right now.</p>;

  const allOn = apps.every((a) => selected.includes(a.id));
  const shortlisted = apps.filter((a) => ["SHORTLISTED", "ASSESSMENT", "INTERVIEW"].includes(a.status)).map((a) => a.id);

  return (
    <div className="candidate-check">
      <div className="row">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(allOn ? [] : apps.map((a) => a.id))}>
          {allOn ? "Clear all" : `Select all ${apps.length}`}
        </button>
        {shortlisted.length > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(shortlisted)}>
            Shortlisted only ({shortlisted.length})
          </button>
        )}
        <span className="toolbar-count">{selected.length} selected</span>
      </div>
      <ul>
        {apps.map((a) => (
          <li key={a.id}>
            <label className="check">
              <input
                type="checkbox"
                checked={selected.includes(a.id)}
                onChange={(e) => onChange(e.target.checked ? [...selected, a.id] : selected.filter((id) => id !== a.id))}
              />
              <span className="candidate-name">{a.student.user.fullName}</span>
              <span className="cell-sub">
                {[a.student.department, a.student.college?.name].filter(Boolean).join(" · ")}
              </span>
              <StatusBadge kind="application" value={a.status} />
              {a.matchScore != null && <span className="num muted">{Math.round(a.matchScore)}%</span>}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default CandidateChecklist;
