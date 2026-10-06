import { useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, CalendarDays, Check, ChevronDown, IndianRupee, MapPin } from "lucide-react";
import { employmentLabel, formatDate, formatSalaryRange } from "../../lib/format";
import MatchScore from "../common/MatchScore";
import ScoreBreakdown from "../common/ScoreBreakdown";
import { Badge } from "../ui";
import EligibilityChecklist from "./EligibilityChecklist";

const MAX_TAGS = 4;

function SkillTags({ skills, tone }) {
  if (!skills?.length) return null;
  const shown = skills.slice(0, MAX_TAGS);
  const extra = skills.length - shown.length;
  return (
    <div className="tag-list">
      {shown.map((s) => (
        <span key={s} className={`tag tag-${tone}`}>
          {s}
        </span>
      ))}
      {extra > 0 && <span className="tag tag-outline">+{extra} more</span>}
    </div>
  );
}

// `action` renders on the right (apply button etc.).
function JobMatchCard({ match, action }) {
  const [showWhy, setShowWhy] = useState(!match.eligible);
  const salary = formatSalaryRange(match.salaryMin, match.salaryMax);
  const type = employmentLabel(match.employmentType);
  const eligible = match.eligible !== false;
  const hasDetails = (match.checks?.length ?? 0) > 0 || (match.explanation?.length ?? 0) > 0;

  return (
    <article className={`card job-card ${eligible ? "" : "job-card-ineligible"}`}>
      <div className="job-card-body">
        <div className="job-card-main">
          <div className="job-card-head">
            <span className="company-mark" aria-hidden="true">
              {(match.companyName ?? "?").charAt(0)}
            </span>
            <div className="job-card-title">
              <h3>{match.title ?? "Role"}</h3>
              <p>{match.companyName ?? "Company"}</p>
            </div>
          </div>

          <div className="meta">
            {match.location && (
              <span>
                <MapPin aria-hidden="true" />
                {match.location}
              </span>
            )}
            {type && (
              <span>
                <Briefcase aria-hidden="true" />
                {type}
              </span>
            )}
            {salary && (
              <span>
                <IndianRupee aria-hidden="true" />
                {salary.replace("₹", "")}
              </span>
            )}
            {match.applicationDeadline && (
              <span>
                <CalendarDays aria-hidden="true" />
                Apply by {formatDate(match.applicationDeadline)}
              </span>
            )}
          </div>

          {eligible && (match.matchedSkills?.length > 0 || match.gapSkills?.length > 0) && (
            <div className="job-card-skills">
              {match.matchedSkills?.length > 0 && (
                <div>
                  <span className="job-card-skills-label">
                    <Check aria-hidden="true" /> You have
                  </span>
                  <SkillTags skills={match.matchedSkills} tone="success" />
                </div>
              )}
              {match.gapSkills?.length > 0 && (
                <div>
                  <span className="job-card-skills-label">To learn</span>
                  <SkillTags skills={match.gapSkills} tone="warning" />
                </div>
              )}
            </div>
          )}

          {match.eligibilitySummary && <p className={`job-card-verdict ${eligible ? "" : "is-blocked"}`}>{match.eligibilitySummary}</p>}
        </div>

        <div className="job-card-side">
          {eligible ? <MatchScore value={match.score} /> : <Badge tone="warning">Not eligible yet</Badge>}
          <div className="job-card-actions">
            {action}
            {(match.gapSkills?.length > 0 || !eligible) && (
              <Link className="btn btn-ghost btn-sm" to={`/student/skill-gap?jobId=${match.jobId}`}>
                View skill gap
              </Link>
            )}
          </div>
        </div>
      </div>

      {hasDetails && (
        <div className="job-card-why">
          <button type="button" className="job-card-why-toggle" onClick={() => setShowWhy((v) => !v)} aria-expanded={showWhy}>
            {eligible ? "How this match was worked out" : "Requirement by requirement"}
            <ChevronDown className={showWhy ? "rotated" : ""} aria-hidden="true" />
          </button>
          {showWhy && (
            <div className="job-card-why-body">
              {match.checks?.length > 0 && <EligibilityChecklist checks={match.checks} />}
              {eligible && match.breakdown && (
                <div>
                  <span className="criteria-label">Match score of {Math.round(match.score ?? 0)}, by factor</span>
                  <ScoreBreakdown breakdown={match.breakdown} />
                </div>
              )}
              {eligible && match.explanation?.length > 0 && (
                <div>
                  <span className="criteria-label">Notes</span>
                  <ul className="bullet-list">
                    {match.explanation.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default JobMatchCard;
