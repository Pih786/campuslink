import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CodeXml } from "lucide-react";
import { api } from "../../services/api";
import { Alert, EmptyState, PageHeader, PageSkeleton, StatusBadge } from "../../components/ui";

const DIFFICULTY_ORDER = { EASY: 0, MEDIUM: 1, HARD: 2 };
const FILTERS = ["ALL", "EASY", "MEDIUM", "HARD"];

function CodeLabList() {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    api
      .get("/coding/problems")
      .then((res) => setProblems(res.data ?? []))
      .catch((err) => setError(err.message || "Could not load coding problems"))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(
    () =>
      problems
        .filter((p) => filter === "ALL" || p.difficulty === filter)
        .sort((a, b) => (DIFFICULTY_ORDER[a.difficulty] ?? 9) - (DIFFICULTY_ORDER[b.difficulty] ?? 9)),
    [problems, filter]
  );

  if (loading) return <PageSkeleton cards={1} />;

  return (
    <div className="page">
      <PageHeader
        title="Coding lab"
        subtitle="Solutions run against hidden test cases. Passing one records verified evidence for that skill."
      />

      {error && <Alert tone="error">{error}</Alert>}

      {problems.length === 0 ? (
        <EmptyState icon={CodeXml} title="No problems published yet" />
      ) : (
        <>
          <div className="segmented" role="group" aria-label="Filter by difficulty">
            {FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <div className="card card-flush">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Problem</th>
                    <th>Skill</th>
                    <th>Difficulty</th>
                    <th className="col-actions">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link className="cell-title" to={`/student/code-lab/${p.id}`}>
                          {p.title}
                        </Link>
                      </td>
                      <td className="muted">{p.skill?.name ?? "—"}</td>
                      <td>
                        <StatusBadge kind="difficulty" value={p.difficulty} />
                      </td>
                      <td className="col-actions">
                        <Link className="btn btn-ghost btn-sm" to={`/student/code-lab/${p.id}`}>
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
        </>
      )}
    </div>
  );
}

export default CodeLabList;
