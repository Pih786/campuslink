import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Play, Send } from "lucide-react";
import { api } from "../../services/api";
import { Alert, EmptyState, PageHeader, PageSkeleton, Spinner } from "../../components/ui";

function ResultTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <EmptyState compact>The query returned no rows.</EmptyState>;
  }

  const headers = Object.keys(rows[0]);

  return (
    <div className="table-wrap result-table">
      <table className="table table-mono">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {headers.map((h) => (
                <td key={h}>{row[h] === null ? <span className="muted">NULL</span> : String(row[h])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SqlLabProblem() {
  const { problemId } = useParams();

  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(null); // "run" | "submit" | null
  const [result, setResult] = useState(null); // { kind, data }
  const [actionError, setActionError] = useState("");
  const [schemaTab, setSchemaTab] = useState("schema");

  useEffect(() => {
    api
      .get(`/sql/problems/${problemId}`)
      .then((res) => setProblem(res.data))
      .catch((err) => setLoadError(err.message || "Could not load this problem"))
      .finally(() => setLoading(false));
  }, [problemId]);

  const execute = async (kind) => {
    setBusy(kind);
    setActionError("");
    setResult(null);
    try {
      const res = await api.post(`/sql/problems/${problemId}/${kind}`, { query });
      setResult({ kind, data: res.data });
    } catch (err) {
      setActionError(err.message || (kind === "run" ? "Could not run your query" : "Could not submit your query"));
    } finally {
      setBusy(null);
    }
  };

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && query.trim() && !busy) {
      e.preventDefault();
      execute("run");
    }
  };

  if (loading) return <PageSkeleton cards={2} />;

  if (loadError || !problem) {
    return (
      <div className="page">
        <PageHeader title="SQL lab" back={{ to: "/student/sql-lab", label: "All problems" }} />
        <Alert tone="error">{loadError || "Problem not found"}</Alert>
      </div>
    );
  }

  const data = result?.data;
  const passed = data?.status === "PASSED";

  return (
    <div className="page page-wide">
      <PageHeader
        back={{ to: "/student/sql-lab", label: "All problems" }}
        title={problem.title}
        subtitle={problem.skill?.name ? `Skill: ${problem.skill.name}` : "General SQL practice"}
      />

      <div className="lab-layout">
        <div className="stack">
          <section className="card">
            <h2 className="card-title">Problem</h2>
            <p className="lab-prose">{problem.description}</p>
          </section>

          <section className="card card-flush">
            <div className="tabs code-tabs" role="tablist">
              <button type="button" role="tab" className="tab" aria-selected={schemaTab === "schema"} onClick={() => setSchemaTab("schema")}>
                Schema
              </button>
              {problem.seedSql && (
                <button type="button" role="tab" className="tab" aria-selected={schemaTab === "seed"} onClick={() => setSchemaTab("seed")}>
                  Sample data
                </button>
              )}
            </div>
            <pre className="code-block">{schemaTab === "schema" ? problem.schemaSql : problem.seedSql}</pre>
          </section>
        </div>

        <div className="stack">
          <section className="card card-flush editor-card">
            <div className="editor-toolbar">
              <span className="editor-toolbar-label">Query</span>
              <div className="row">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => execute("run")} disabled={Boolean(busy) || !query.trim()}>
                  {busy === "run" ? <Spinner /> : <Play />}
                  Run
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => execute("submit")} disabled={Boolean(busy) || !query.trim()}>
                  {busy === "submit" ? <Spinner /> : <Send />}
                  Submit
                </button>
              </div>
            </div>
            <textarea
              className="sql-editor"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="SELECT ..."
              spellCheck={false}
              rows={10}
              disabled={Boolean(busy)}
              aria-label="SQL query"
            />
            <div className="editor-foot">Only a single SELECT or WITH statement is allowed. Ctrl + Enter to run.</div>
          </section>

          {actionError && <Alert tone="error">{actionError}</Alert>}

          {data && (
            <section className="card">
              <div className="card-header">
                <h2 className="card-title">{result.kind === "run" ? "Result" : "Submission result"}</h2>
              </div>
              <div className="stack">
                <Alert tone={passed ? "success" : "error"}>
                  {passed
                    ? result.kind === "submit"
                      ? "Correct. Verified evidence was added to your skill passport."
                      : "Your output matches the expected result."
                    : data.status === "ERROR"
                      ? "The query failed to run."
                      : "Your output doesn't match the expected result yet."}
                </Alert>
                {data.errorMessage && <pre className="code-block code-block-error">{data.errorMessage}</pre>}

                {data.resultPreview && (
                  <div>
                    <h3 className="lab-subheading">Your output</h3>
                    <ResultTable rows={data.resultPreview} />
                  </div>
                )}

                {data.status === "FAILED" && data.expectedPreview && (
                  <div>
                    <h3 className="lab-subheading">Expected output</h3>
                    <ResultTable rows={data.expectedPreview} />
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export default SqlLabProblem;
