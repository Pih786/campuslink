import { useEffect, useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { fetchAllStudents } from "../../lib/students";
import { Alert, Avatar, EmptyState, PageHeader, PageSkeleton } from "../../components/ui";

function PlacementStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("");

  useEffect(() => {
    fetchAllStudents()
      .then(setStudents)
      .catch((err) => setError(err.message || "Could not load students"))
      .finally(() => setLoading(false));
  }, []);

  const branches = useMemo(
    () => [...new Set(students.map((s) => s.department).filter(Boolean))].sort(),
    [students]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students
      .filter((s) => !branch || s.department === branch)
      .filter((s) => !q || [s.user?.fullName, s.user?.email, s.department].filter(Boolean).join(" ").toLowerCase().includes(q))
      .sort((a, b) => (a.user?.fullName ?? "").localeCompare(b.user?.fullName ?? ""));
  }, [students, query, branch]);

  if (loading) return <PageSkeleton cards={1} />;

  return (
    <div className="page">
      <PageHeader title="Students" subtitle={`${students.length} registered on CampusLink`} />

      {error && <Alert tone="error">{error}</Alert>}

      {students.length === 0 ? (
        <EmptyState icon={Users} title="No students registered yet" />
      ) : (
        <>
          <div className="toolbar">
            <label className="search-input">
              <Search aria-hidden="true" />
              <input type="search" placeholder="Search by name or email" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search students" />
            </label>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Filter by branch">
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <span className="toolbar-count">{visible.length} shown</span>
          </div>

          <div className="card card-flush">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Branch</th>
                    <th className="col-num">CGPA</th>
                    <th className="col-num">Backlogs</th>
                    <th className="col-num">Batch</th>
                    <th>Profile</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => {
                    const completion = s.profileCompletion ?? 0;
                    return (
                      <tr key={s.id}>
                        <td>
                          <div className="cell-person">
                            <Avatar name={s.user?.fullName} size="sm" />
                            <div>
                              <div className="cell-title">{s.user?.fullName ?? "—"}</div>
                              <div className="cell-sub">{s.user?.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>{s.department ?? "—"}</td>
                        <td className="col-num">{s.cgpa || "—"}</td>
                        <td className="col-num">{s.backlogCount ?? 0}</td>
                        <td className="col-num">{s.graduationYear ?? "—"}</td>
                        <td>
                          <div className="inline-meter">
                            <div className={`progress ${completion >= 100 ? "progress-success" : ""}`}>
                              <span style={{ width: `${completion}%` }} />
                            </div>
                            <span className="num">{completion}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {visible.length === 0 && <EmptyState compact>No students match your filters.</EmptyState>}
          </div>
        </>
      )}
    </div>
  );
}

export default PlacementStudents;
