import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ClipboardCheck, Target, Timer } from "lucide-react";
import { api } from "../../services/api";
import { Alert, Badge, EmptyState, PageHeader, PageSkeleton } from "../../components/ui";

function AssessmentList() {
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/assessments")
      .then((res) => setAssessments(res.data ?? []))
      .catch((err) => setError(err.message || "Could not load assessments"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton cards={2} />;

  return (
    <div className="page">
      <PageHeader
        title="Assessments"
        subtitle="Timed tests: multiple-choice, or written answers scored for communication. The timer starts when you open one and it submits itself when time runs out."
      />

      {error && <Alert tone="error">{error}</Alert>}

      {assessments.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No assessments available yet" />
      ) : (
        <div className="card-grid">
          {assessments.map((a) => (
            <article key={a.id} className="card assessment-card">
              <div className="assessment-card-head">
                <h3>{a.title}</h3>
                <Badge tone={a.type === "WRITTEN" ? "brand" : "neutral"}>{a.type === "WRITTEN" ? "Written" : "Multiple choice"}</Badge>
                {a.skill?.name && (
                  <Badge tone="brand" plain>
                    {a.skill.name}
                  </Badge>
                )}
              </div>
              {a.description && <p className="assessment-card-desc">{a.description}</p>}
              <div className="meta">
                <span>
                  <Timer aria-hidden="true" />
                  {a.durationMinutes} minutes
                </span>
                <span>
                  <Target aria-hidden="true" />
                  Pass mark {a.passScore}%
                </span>
              </div>
              <div className="assessment-card-foot">
                <Link className="btn btn-secondary btn-sm" to={`/student/assessments/${a.id}`}>
                  Start
                  <ArrowRight />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default AssessmentList;
