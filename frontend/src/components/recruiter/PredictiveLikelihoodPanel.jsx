import { useState } from "react";
import { ChevronDown, FlaskConical } from "lucide-react";
import { api } from "../../services/api";
import { Alert, EmptyState, Spinner } from "../ui";

// A SEPARATE, experimental predictive signal -- a small trained model
// (logistic regression), evaluated on data the main ranking above never
// touches. It is not used for shortlisting or blended into the match score;
// it's shown here, collapsed by default and clearly labeled, purely as a
// second opinion a recruiter can choose to look at.
function PredictiveLikelihoodPanel({ jobId }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [showInfo, setShowInfo] = useState(false);

  const load = () => {
    if (data || error) return;
    Promise.all([api.get(`/predictive/jobs/${jobId}/candidates`), api.get("/predictive/model-info")])
      .then(([c, i]) => {
        setData(c.data);
        setInfo(i.data);
      })
      .catch((err) => setError(err.message || "Could not load predictions"));
  };

  return (
    <section className="card predictive-panel">
      <button
        type="button"
        className="predictive-toggle"
        onClick={() => {
          setOpen((v) => !v);
          load();
        }}
        aria-expanded={open}
      >
        <FlaskConical aria-hidden="true" />
        <span className="predictive-toggle-text">
          <strong>Predictive likelihood</strong>
          <span>Experimental — a separately trained ML model's estimate, for comparison only</span>
        </span>
        <ChevronDown className="predictive-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="predictive-body">
          {error && <Alert tone="error">{error}</Alert>}
          {!data && !error && (
            <div className="videos-loading">
              <Spinner /> Loading
            </div>
          )}
          {data && !data.modelAvailable && (
            <EmptyState compact>The predictive model hasn't been trained yet on this deployment.</EmptyState>
          )}
          {data && data.modelAvailable && (
            <>
              <Alert tone="info">
                Trained on simulated historical placement data, kept separate from the match score above — it is{" "}
                <strong>not</strong> used to shortlist or rank candidates. Shown as a second, independent opinion.
              </Alert>
              <ul className="predictive-list">
                {data.candidates.map((c) => (
                  <li key={c.studentId}>
                    <span>{c.fullName}</span>
                    <span className="num">{c.available && c.probability != null ? `${Math.round(c.probability * 100)}%` : "—"}</span>
                  </li>
                ))}
              </ul>
              {info?.available && (
                <>
                  <button type="button" className="copilot-link" onClick={() => setShowInfo((v) => !v)} aria-expanded={showInfo}>
                    {showInfo ? "Hide model details" : "How was this model trained?"}
                  </button>
                  {showInfo && (
                    <div className="predictive-info">
                      <p>{info.notes}</p>
                      <p>
                        Trained on {info.trainedOn.eligiblePairs.toLocaleString()} simulated candidate-role pairs across{" "}
                        {info.trainedOn.seasons} past seasons; evaluated on {info.evaluatedOn.eligiblePairs.toLocaleString()}{" "}
                        pairs from {info.evaluatedOn.seasons} unseen future seasons.
                      </p>
                      <table className="table predictive-metrics">
                        <thead>
                          <tr>
                            <th>Scorer</th>
                            <th>AUC</th>
                            <th>Precision@10</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(info.metrics).map(([name, m]) => (
                            <tr key={name}>
                              <td>{name === "trained_model" ? "This trained model" : "Existing hand-set formula"}</td>
                              <td>{m.auc}</td>
                              <td>{m.precisionAt10}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="field-hint">Feature importance (standardized, most influential first):</p>
                      <div className="tag-list">
                        {info.featureImportance.map((f) => (
                          <span key={f.feature} className="tag">
                            {f.feature.replace(/_/g, " ")} <strong className="num">{f.coefficient > 0 ? "+" : ""}{f.coefficient}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default PredictiveLikelihoodPanel;
