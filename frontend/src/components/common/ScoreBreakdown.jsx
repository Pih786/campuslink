// Mirrors ai-service scoring.py weights; the overall score is the weighted sum.
const COMPONENTS = [
  { key: "skill_match", label: "Skills", weight: 0.4 },
  { key: "education", label: "Academics", weight: 0.2 },
  { key: "assessment", label: "Verified assessments", weight: 0.1 },
  { key: "projects", label: "Projects", weight: 0.1 },
  { key: "certifications", label: "Certifications", weight: 0.1 },
  { key: "experience", label: "Experience", weight: 0.1 },
];

function ScoreBreakdown({ breakdown }) {
  if (!breakdown || typeof breakdown !== "object") return null;
  const rows = COMPONENTS.filter((c) => breakdown[c.key] != null);
  if (rows.length === 0) return null;

  return (
    <div className="breakdown">
      <div className="breakdown-head" aria-hidden="true">
        <span>Factor</span>
        <span />
        <span>Score</span>
        <span>Adds</span>
      </div>
      <ul>
        {rows.map((c) => {
          const value = Math.round(Number(breakdown[c.key]) || 0);
          const points = Math.round(value * c.weight * 10) / 10;
          return (
            <li key={c.key} className="breakdown-row">
              <span className="breakdown-label">
                {c.label} <span className="muted">· {Math.round(c.weight * 100)}%</span>
              </span>
              <span className="breakdown-bar" aria-hidden="true">
                <span style={{ width: `${value}%` }} />
              </span>
              <span className="breakdown-value num">{value}</span>
              <span className="breakdown-points num">+{points}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default ScoreBreakdown;
