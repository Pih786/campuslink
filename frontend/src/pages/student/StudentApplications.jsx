import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { api } from "../../services/api";
import { formatDate } from "../../lib/format";
import { Alert, EmptyState, PageHeader, PageSkeleton, StatusBadge } from "../../components/ui";

const FILTERS = [
  { key: "active", label: "In progress", statuses: ["APPLIED", "ELIGIBLE", "SHORTLISTED", "ASSESSMENT", "INTERVIEW", "SELECTED", "OFFERED"] },
  { key: "done", label: "Closed", statuses: ["ACCEPTED", "JOINED", "REJECTED", "DECLINED"] },
  { key: "all", label: "All", statuses: null },
];

function StudentApplications() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    api
      .get("/applications")
      .then((res) => setApplications(res.data ?? []))
      .catch((err) => setError(err.message || "Could not load your applications"))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [f.key, f.statuses ? applications.filter((a) => f.statuses.includes(a.status)).length : applications.length])
      ),
    [applications]
  );

  if (loading) return <PageSkeleton cards={1} />;

  const statuses = FILTERS.find((f) => f.key === filter).statuses;
  const visible = (statuses ? applications.filter((a) => statuses.includes(a.status)) : applications)
    .slice()
    .sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));

  return (
    <div className="page">
      <PageHeader title="Applications" subtitle="Every role you've applied to and where it stands." />

      {error && <Alert tone="error">{error}</Alert>}

      {applications.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No applications yet"
          action={
            <Link className="btn btn-primary" to="/student/jobs">
              Browse job matches
            </Link>
          }
        >
          Apply to roles from your job matches and track their progress here.
        </EmptyState>
      ) : (
        <>
          <div className="tabs" role="tablist">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" role="tab" className="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label}
                <span className="tab-count">{counts[f.key]}</span>
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyState compact>Nothing here.</EmptyState>
          ) : (
            <div className="card card-flush">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Status</th>
                      <th className="col-num">Match</th>
                      <th>Applied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((app) => (
                      <tr key={app.id}>
                        <td>
                          <div className="cell-title">{app.job?.title ?? "—"}</div>
                          <div className="cell-sub">{app.job?.company?.name ?? "—"}</div>
                        </td>
                        <td>
                          <StatusBadge kind="application" value={app.status} />
                        </td>
                        <td className="col-num">{app.matchScore != null ? `${Math.round(app.matchScore)}%` : "—"}</td>
                        <td className="muted">{formatDate(app.appliedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default StudentApplications;
