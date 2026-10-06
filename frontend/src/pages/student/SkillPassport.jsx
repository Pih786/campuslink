import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, ChevronDown, ShieldCheck } from "lucide-react";
import { api } from "../../services/api";
import { formatDate } from "../../lib/format";
import { Alert, EmptyState, PageHeader, PageSkeleton, StatCard } from "../../components/ui";

const LEVELS = [1, 2, 3, 4, 5];

const SOURCE_LABELS = {
  CODING: "Coding lab",
  SQL: "SQL lab",
  ASSESSMENT: "Assessment",
  RESUME: "Resume",
  SELF_DECLARED: "Self-declared",
  PROJECT: "Project",
  CERTIFICATION: "Certification",
  INTERVIEW: "Interview",
};

function SkillPassport() {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    api
      .get("/students/me/skill-passport")
      .then((res) => setSkills(res.data ?? []))
      .catch((err) => setError(err.message || "Could not load your skill passport"))
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => {
    const byCategory = {};
    [...skills]
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((s) => {
        const key = s.category || "General";
        (byCategory[key] ??= []).push(s);
      });
    return Object.entries(byCategory).sort((a, b) => a[0].localeCompare(b[0]));
  }, [skills]);

  const toggle = (skillId) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });

  if (loading) return <PageSkeleton stats={3} cards={2} />;

  const verified = skills.filter((s) => s.verified).length;
  const evidence = skills.reduce((sum, s) => sum + (s.evidenceCount ?? 0), 0);

  return (
    <div className="page">
      <PageHeader
        title="Skill passport"
        subtitle="Your skills, with the evidence behind each one. Verified skills carry more weight in matching."
      />

      {error && <Alert tone="error">{error}</Alert>}

      {skills.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Your passport is empty"
          action={
            <Link className="btn btn-primary" to="/student/code-lab">
              Try the coding lab
            </Link>
          }
        >
          Add skills to your profile, then prove them in the coding lab, SQL lab or an assessment.
        </EmptyState>
      ) : (
        <>
          <div className="stat-grid stat-grid-3">
            <StatCard label="Skills" value={skills.length} />
            <StatCard label="Verified" value={verified} tone={verified ? "success" : undefined} meta="Proven in a lab or assessment" />
            <StatCard label="Evidence records" value={evidence} />
          </div>

          {groups.map(([category, categorySkills]) => (
            <section key={category} className="card card-flush">
              <div className="card-header">
                <h2 className="card-title">{category}</h2>
                <span className="muted">{categorySkills.length}</span>
              </div>
              <ul className="passport-list">
                {categorySkills.map((s) => {
                  const isOpen = expanded.has(s.skillId);
                  const level = s.proficiency ?? 0;
                  return (
                    <li key={s.skillId} className="passport-item">
                      <button
                        type="button"
                        className="passport-row"
                        onClick={() => toggle(s.skillId)}
                        aria-expanded={isOpen}
                      >
                        <span className="passport-name">
                          {s.name}
                          {s.verified && <BadgeCheck className="icon-success" aria-label="Verified" />}
                        </span>
                        <span className="level-meter" title={`Level ${level} of 5`}>
                          {LEVELS.map((n) => (
                            <span key={n} className={n <= level ? "on" : ""} />
                          ))}
                          <span className="level-meter-label">L{level}</span>
                        </span>
                        <span className="passport-evidence-count">
                          {s.evidenceCount ?? 0} evidence
                          <ChevronDown className={isOpen ? "rotated" : ""} aria-hidden="true" />
                        </span>
                      </button>

                      {isOpen && (
                        <div className="passport-evidence">
                          {(s.evidence ?? []).length === 0 ? (
                            <p className="muted">No evidence yet. Pass a lab problem or assessment for this skill.</p>
                          ) : (
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>Source</th>
                                  <th className="col-num">Score</th>
                                  <th>Date</th>
                                </tr>
                              </thead>
                              <tbody>
                                {s.evidence.map((e, i) => (
                                  <tr key={i}>
                                    <td>{SOURCE_LABELS[e.sourceType] ?? e.sourceType}</td>
                                    <td className="col-num">{e.score ?? "—"}</td>
                                    <td className="muted">{formatDate(e.createdAt)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

export default SkillPassport;
