import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { Play, Send } from "lucide-react";
import { api } from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import { Alert, PageHeader, PageSkeleton, Spinner, StatusBadge } from "../../components/ui";
import TestCaseList from "../../components/labs/TestCaseList";

const LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
];

const EMPTY_CODE_MAP = { javascript: "", python: "", java: "", cpp: "" };

function CodeLabProblem() {
  const { problemId } = useParams();
  const { theme } = useTheme();

  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [language, setLanguage] = useState("javascript");
  const [codeMap, setCodeMap] = useState(EMPTY_CODE_MAP);

  const [busy, setBusy] = useState(null); // "run" | "submit" | null
  const [result, setResult] = useState(null); // { kind, data }
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    setLoading(true);
    api
      .get(`/coding/problems/${problemId}`)
      .then((res) => {
        const data = res.data;
        setProblem(data);
        setCodeMap({
          javascript: data.starterCode?.javascript ?? "",
          python: data.starterCode?.python ?? "",
          java: data.starterCode?.java ?? "",
          cpp: data.starterCode?.cpp ?? "",
        });
      })
      .catch((err) => setLoadError(err.message || "Could not load this problem"))
      .finally(() => setLoading(false));
  }, [problemId]);

  const execute = async (kind) => {
    setBusy(kind);
    setActionError("");
    setResult(null);
    try {
      const res = await api.post(`/coding/problems/${problemId}/${kind}`, { language, code: codeMap[language] });
      setResult({ kind, data: res.data });
    } catch (err) {
      setActionError(err.message || (kind === "run" ? "Could not run your code" : "Could not submit your code"));
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <PageSkeleton cards={2} />;

  if (loadError || !problem) {
    return (
      <div className="page">
        <PageHeader title="Coding lab" back={{ to: "/student/code-lab", label: "All problems" }} />
        <Alert tone="error">{loadError || "Problem not found"}</Alert>
      </div>
    );
  }

  const isRun = result?.kind === "run";
  const cases = result ? (isRun ? result.data.results : result.data.output) ?? [] : [];
  const passed = isRun
    ? result?.data.passedCount === result?.data.totalCount
    : result?.data.status === "PASSED";

  return (
    <div className="page page-wide">
      <PageHeader
        back={{ to: "/student/code-lab", label: "All problems" }}
        title={problem.title}
        subtitle={
          <span className="row">
            <StatusBadge kind="difficulty" value={problem.difficulty} />
            {problem.skill?.name && <span className="muted">{problem.skill.name}</span>}
          </span>
        }
      />

      <div className="lab-layout">
        <div className="stack">
          <section className="card">
            <h2 className="card-title">Problem</h2>
            <p className="lab-prose">{problem.description}</p>
          </section>

          {(problem.visibleTests ?? []).length > 0 && (
            <section className="card">
              <h2 className="card-title lab-card-title">Examples</h2>
              <TestCaseList cases={problem.visibleTests} />
            </section>
          )}
        </div>

        <div className="stack">
          <section className="card card-flush editor-card">
            <div className="editor-toolbar">
              <select
                aria-label="Language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={Boolean(busy)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
              <div className="row">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => execute("run")} disabled={Boolean(busy)}>
                  {busy === "run" ? <Spinner /> : <Play />}
                  Run examples
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => execute("submit")} disabled={Boolean(busy)}>
                  {busy === "submit" ? <Spinner /> : <Send />}
                  Submit
                </button>
              </div>
            </div>
            <div className="editor-frame">
              <Editor
                height="440px"
                language={language}
                value={codeMap[language]}
                onChange={(value) => setCodeMap((prev) => ({ ...prev, [language]: value ?? "" }))}
                theme={theme === "dark" ? "vs-dark" : "vs"}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: "'IBM Plex Mono', monospace",
                  scrollBeyondLastLine: false,
                  padding: { top: 12 },
                }}
              />
            </div>
          </section>

          {busy && (
            <Alert tone="info">
              {busy === "run" ? "Running the examples" : "Running the full hidden test suite"} on the judge. This
              usually takes a few seconds.
            </Alert>
          )}

          {actionError && <Alert tone="error">{actionError}</Alert>}

          {result && (
            <section className="card">
              <div className="card-header">
                <h2 className="card-title">{isRun ? "Example results" : "Submission result"}</h2>
              </div>
              <Alert tone={passed ? "success" : "error"}>
                {isRun
                  ? `${result.data.passedCount} of ${result.data.totalCount} examples passed.`
                  : passed
                    ? `All ${result.data.totalCount} tests passed. Verified evidence was added to your skill passport.`
                    : `${result.data.passedCount} of ${result.data.totalCount} tests passed (${String(result.data.status).toLowerCase()}).`}
              </Alert>
              {cases.length > 0 && (!passed || isRun) && (
                <div className="lab-results">
                  <TestCaseList cases={cases} />
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export default CodeLabProblem;
