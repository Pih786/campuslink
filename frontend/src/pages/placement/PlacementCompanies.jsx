import { useEffect, useMemo, useState } from "react";
import { Building2, Search } from "lucide-react";
import { api } from "../../services/api";
import { Alert, EmptyState, PageHeader, PageSkeleton, StatusBadge } from "../../components/ui";

function PlacementCompanies() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    api
      .get("/companies?limit=100")
      .then((res) => setCompanies(res.data ?? []))
      .catch((err) => setError(err.message || "Could not load companies"))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies
      .filter((c) => !q || [c.name, c.industry, c.location].filter(Boolean).join(" ").toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [companies, query]);

  if (loading) return <PageSkeleton cards={1} />;

  return (
    <div className="page">
      <PageHeader title="Companies" subtitle={`${companies.length} recruiting partners`} />

      {error && <Alert tone="error">{error}</Alert>}

      {companies.length === 0 ? (
        <EmptyState icon={Building2} title="No companies yet">
          Companies are added automatically when a recruiter signs up.
        </EmptyState>
      ) : (
        <>
          <div className="toolbar">
            <label className="search-input">
              <Search aria-hidden="true" />
              <input type="search" placeholder="Search companies" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search companies" />
            </label>
          </div>

          <div className="card card-flush">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Industry</th>
                    <th>Location</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="cell-person">
                          <span className="company-mark company-mark-sm" aria-hidden="true">
                            {c.name.charAt(0)}
                          </span>
                          <div>
                            <div className="cell-title">{c.name}</div>
                            {/^https?:\/\//i.test(c.website ?? "") && (
                              <a className="cell-sub" href={c.website} target="_blank" rel="noreferrer">
                                {c.website.replace(/^https?:\/\//, "")}
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{c.industry ?? <span className="muted">—</span>}</td>
                      <td>{c.location ?? <span className="muted">—</span>}</td>
                      <td>
                        <StatusBadge kind="company" value={c.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visible.length === 0 && <EmptyState compact>No companies match your search.</EmptyState>}
          </div>
        </>
      )}
    </div>
  );
}

export default PlacementCompanies;
