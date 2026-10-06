import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Gauge } from "lucide-react";
import { Card, EmptyState, StatusBadge } from "../ui";

const COLLAPSED_COUNT = 4;

function toneFor(score) {
  if (score >= 80) return "success";
  if (score >= 60) return "brand";
  if (score >= 40) return "warning";
  return "neutral";
}

function gapSummary(role) {
  const parts = [];
  if (role.missing.length) {
    const shown = role.missing.slice(0, 3).join(", ");
    const extra = role.missing.length - 3;
    parts.push(`Missing ${shown}${extra > 0 ? ` +${extra}` : ""}`);
  }
  if (role.weak.length) {
    parts.push(`${role.weak.length} below required level`);
  }
  return parts.length ? parts.join(" · ") : "Every required skill at the required level";
}

// roles: [{ role, jobIds, score, band, requiredSkillCount, matched, weak, missing }]
function RoleReadiness({ roles }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? roles : roles.slice(0, COLLAPSED_COUNT);

  return (
    <Card flush title="Readiness by role" subtitle="Your skill levels against each role's requirements">
      {roles.length === 0 ? (
        <EmptyState compact icon={Gauge}>
          Readiness appears once recruiters publish roles with skill requirements.
        </EmptyState>
      ) : (
        <>
          <ul className="list">
            {visible.map((r) => (
              <li key={r.role}>
                <Link className="list-row readiness-row" to={`/student/skill-gap?jobId=${r.jobIds[0]}`}>
                  <div className="readiness-main">
                    <div className="readiness-head">
                      <strong>{r.role}</strong>
                      <StatusBadge kind="readiness" value={r.band} />
                    </div>
                    <div className={`progress readiness-bar tone-${toneFor(r.score)}`} aria-hidden="true">
                      <span style={{ width: `${r.score}%` }} />
                    </div>
                    <span className="readiness-detail">
                      {r.matched.length} of {r.requiredSkillCount} skills met · {gapSummary(r)}
                    </span>
                  </div>
                  <span className="readiness-score num" aria-label={`Readiness ${r.score} out of 100`}>
                    {r.score}
                  </span>
                  <ChevronRight className="list-row-chevron" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          <div className="readiness-foot">
            <p>
              A configured indicator: the average of your skill levels (out of 5) across each role's required skills.
              It is not a prediction of whether you'll be hired.
            </p>
            {roles.length > COLLAPSED_COUNT && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExpanded((v) => !v)}>
                {expanded ? "Show fewer" : `Show all ${roles.length} roles`}
              </button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

export default RoleReadiness;
