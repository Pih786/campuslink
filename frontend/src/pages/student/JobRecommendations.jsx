import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, Check, Search } from "lucide-react";
import { api } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { Alert, EmptyState, PageHeader, PageSkeleton, Spinner } from "../../components/ui";
import JobMatchCard from "../../components/student/JobMatchCard";

const SORTS = {
  match: (a, b) => (b.score ?? 0) - (a.score ?? 0),
  deadline: (a, b) =>
    new Date(a.applicationDeadline ?? "9999-12-31") - new Date(b.applicationDeadline ?? "9999-12-31"),
};

function JobRecommendations() {
  const toast = useToast();

  const [jobs, setJobs] = useState([]);
  const [appliedJobIds, setAppliedJobIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [applyingId, setApplyingId] = useState(null);
  const [tab, setTab] = useState("eligible");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("match");
  const [hideApplied, setHideApplied] = useState(false);

  useEffect(() => {
    Promise.all([api.get("/matching/student/me/jobs?include=all"), api.get("/applications")])
      .then(([matchesRes, applicationsRes]) => {
        setJobs(matchesRes.data ?? []);
        setAppliedJobIds(new Set((applicationsRes.data ?? []).map((a) => a.jobId)));
      })
      .catch((err) => setError(err.message || "Could not load job matches"))
      .finally(() => setLoading(false));
  }, []);

  const eligibleCount = jobs.filter((j) => j.eligible).length;
  const blockedCount = jobs.length - eligibleCount;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs
      .filter((m) => (tab === "eligible" ? m.eligible : !m.eligible))
      .filter((m) => !hideApplied || !appliedJobIds.has(m.jobId))
      .filter((m) => !q || [m.title, m.companyName, m.location].filter(Boolean).join(" ").toLowerCase().includes(q))
      .sort(SORTS[sort]);
  }, [jobs, tab, query, sort, hideApplied, appliedJobIds]);

  const handleApply = async (match) => {
    setApplyingId(match.jobId);
    try {
      await api.post("/applications", { jobId: match.jobId });
      setAppliedJobIds((prev) => new Set(prev).add(match.jobId));
      toast.success(`Applied to ${match.title} at ${match.companyName}`);
    } catch (err) {
      toast.error(err.message || "Could not submit your application");
    } finally {
      setApplyingId(null);
    }
  };

  if (loading) return <PageSkeleton cards={3} />;

  return (
    <div className="page">
      <PageHeader
        title="Job matches"
        subtitle="Every open role, checked against its CGPA, branch, backlog and skill requirements."
      />

      {error && <Alert tone="error">{error}</Alert>}

      {jobs.length === 0 ? (
        <EmptyState icon={Briefcase} title="No open roles yet">
          Roles appear here as soon as recruiters publish them.
        </EmptyState>
      ) : (
        <>
          <div className="tabs" role="tablist">
            <button type="button" role="tab" className="tab" aria-selected={tab === "eligible"} onClick={() => setTab("eligible")}>
              Eligible <span className="tab-count">{eligibleCount}</span>
            </button>
            <button type="button" role="tab" className="tab" aria-selected={tab === "blocked"} onClick={() => setTab("blocked")}>
              Not eligible yet <span className="tab-count">{blockedCount}</span>
            </button>
          </div>

          {tab === "blocked" && blockedCount > 0 && (
            <Alert tone="info">
              These roles have a requirement you don't meet yet. Each card says exactly which one, so you know what to
              work on.
            </Alert>
          )}

          <div className="toolbar">
            <label className="search-input">
              <Search aria-hidden="true" />
              <input
                type="search"
                placeholder="Search by role, company or city"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search roles"
              />
            </label>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
              <option value="match">Best match first</option>
              <option value="deadline">Closing soonest</option>
            </select>
            {tab === "eligible" && (
              <label className="check">
                <input type="checkbox" checked={hideApplied} onChange={(e) => setHideApplied(e.target.checked)} />
                Hide roles I've applied to
              </label>
            )}
            <span className="toolbar-count">{visible.length} shown</span>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              compact
              action={
                tab === "eligible" &&
                eligibleCount === 0 && (
                  <Link className="btn btn-secondary" to="/student/profile">
                    Update your profile
                  </Link>
                )
              }
            >
              {tab === "eligible" && eligibleCount === 0
                ? "You don't qualify for any open role yet. The Not eligible yet tab shows what's blocking each one."
                : tab === "blocked" && blockedCount === 0
                  ? "You qualify for every open role."
                  : "No roles match your filters."}
            </EmptyState>
          ) : (
            <div className="stack">
              {visible.map((m) => {
                const applied = appliedJobIds.has(m.jobId);
                const applying = applyingId === m.jobId;
                let action = null;
                if (m.eligible && applied) {
                  action = (
                    <span className="btn btn-secondary btn-sm applied-state" aria-disabled="true">
                      <Check />
                      Applied
                    </span>
                  );
                } else if (m.eligible) {
                  action = (
                    <button type="button" className="btn btn-primary btn-sm" disabled={applying} onClick={() => handleApply(m)}>
                      {applying && <Spinner />}
                      {applying ? "Applying" : "Apply"}
                    </button>
                  );
                }
                return <JobMatchCard key={m.jobId} match={m} action={action} />;
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default JobRecommendations;
