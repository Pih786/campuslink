import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Database } from "lucide-react";
import { api } from "../../services/api";
import { Alert, EmptyState, PageHeader, PageSkeleton } from "../../components/ui";

function SqlLabList() {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/sql/problems")
      .then((res) => setProblems(res.data ?? []))
      .catch((err) => setError(err.message || "Could not load SQL problems"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton cards={1} />;

  return (
    <div className="page">
      <PageHeader
        title="SQL lab"
        subtitle="Queries run read-only against a sandboxed copy of each problem's tables."
      />

      {error && <Alert tone="error">{error}</Alert>}

      {problems.length === 0 ? (
        <EmptyState icon={Database} title="No SQL problems published yet" />
      ) : (
        <div className="card card-flush">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Problem</th>
                  <th>Skill</th>
                  <th className="col-actions">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {problems.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link className="cell-title" to={`/student/sql-lab/${p.id}`}>
                        {p.title}
                      </Link>
                    </td>
                    <td className="muted">{p.skill?.name ?? "—"}</td>
                    <td className="col-actions">
                      <Link className="btn btn-ghost btn-sm" to={`/student/sql-lab/${p.id}`}>
                        Solve
                        <ArrowRight />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default SqlLabList;
