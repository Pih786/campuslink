import { MOCK_CRITERIA } from "./MockInterviewModal";

export function scoreTone(score) {
  if (score >= 7) return "success";
  if (score >= 5) return "warning";
  return "danger";
}

// The four sub-scores as short bars, 0-10.
function MockInterviewScores({ interview }) {
  return (
    <dl className="mock-scores">
      {MOCK_CRITERIA.map((c) => (
        <div key={c.key}>
          <dt>{c.label}</dt>
          <dd>
            <span className={`mock-bar tone-${scoreTone(interview[c.key])}`} aria-hidden="true">
              <span style={{ width: `${interview[c.key] * 10}%` }} />
            </span>
            <span className="num">{interview[c.key]}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default MockInterviewScores;
