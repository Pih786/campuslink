function toneFor(score) {
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}

// Compact score with a thin bar; `size="sm"` for dense lists.
function MatchScore({ value, size, label = "match" }) {
  const score = Math.round(Number(value) || 0);
  return (
    <div className={`match-score match-${toneFor(score)} ${size === "sm" ? "match-score-sm" : ""}`.trim()}>
      <span className="match-score-value">
        {score}
        <small>%</small>
      </span>
      <span className="match-score-label">{label}</span>
      <span className="match-score-bar" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </span>
    </div>
  );
}

export default MatchScore;
