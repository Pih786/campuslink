import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import { api } from "../../services/api";
import { Alert, Spinner } from "../ui";

const MIN_CHARS = 20;

// Paste a job description; the backend extracts structured requirements
// (checked against the text, with a keyword-parser fallback) and the parent
// form applies them. Nothing is published until the recruiter submits.
function JdAutofill({ onApply }) {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const analyze = async () => {
    setAnalyzing(true);
    setError("");
    try {
      const res = await api.post("/ai/jobs/analyze", { text });
      const data = res.data;
      if (data.aiUnavailable) {
        setError("The extraction service is unreachable right now. Please fill in the form manually.");
        return;
      }
      setResult(data);
      onApply(data, text);
    } catch (err) {
      setError(err.message || "Could not read the job description");
    } finally {
      setAnalyzing(false);
    }
  };

  const chars = text.trim().length;

  return (
    <div className={`jd-panel ${open ? "is-open" : ""}`}>
      <button type="button" className="jd-panel-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="jd-panel-icon">
          <FileText aria-hidden="true" />
        </span>
        <span className="jd-panel-heading">
          <strong>Start from a job description</strong>
          <small>Paste the JD and the requirements below are pre-filled for you to review.</small>
        </span>
        <ChevronDown className={`jd-panel-chevron ${open ? "rotated" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="jd-panel-body">
          <textarea
            aria-label="Job description"
            placeholder="Paste the full job description, including required skills, eligibility and location."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            disabled={analyzing}
          />

          <div className="jd-panel-actions">
            <span className="field-hint num">
              {chars.toLocaleString()} characters{chars > 0 && chars < MIN_CHARS ? ` · at least ${MIN_CHARS} needed` : ""}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={analyze} disabled={analyzing || chars < MIN_CHARS}>
              {analyzing && <Spinner />}
              {analyzing ? "Reading description" : "Extract requirements"}
            </button>
          </div>

          {error && <Alert tone="error">{error}</Alert>}

          {result && (
            <div className="jd-result">
              <Alert tone={result.source === "llm" ? "success" : "warning"} title="Form pre-filled — check the highlighted fields">
                {result.source === "llm"
                  ? "Every skill listed was found in the description text."
                  : "The language model was unavailable, so a keyword parser was used. Double-check which skills are required."}
              </Alert>

              <div className="jd-result-grid">
                <div>
                  <span className="jd-result-label">Required skills · {result.mandatorySkills.length}</span>
                  <div className="tag-list">
                    {result.mandatorySkills.length === 0 ? (
                      <span className="muted">None found</span>
                    ) : (
                      result.mandatorySkills.map((s) => (
                        <span key={s} className="tag">
                          {s}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <span className="jd-result-label">Preferred skills · {result.optionalSkills.length}</span>
                  <div className="tag-list">
                    {result.optionalSkills.length === 0 ? (
                      <span className="muted">None found</span>
                    ) : (
                      result.optionalSkills.map((s) => (
                        <span key={s} className="tag tag-outline">
                          {s}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {(result.responsibilities ?? []).length > 0 && (
                <div>
                  <span className="jd-result-label">Responsibilities</span>
                  <ul className="bullet-list">
                    {result.responsibilities.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default JdAutofill;
