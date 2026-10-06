import { useEffect, useState } from "react";
import { Mic, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "../../services/api";
import MockInterviewScores, { scoreTone } from "../../components/mock-interviews/MockInterviewScores";
import { Alert, Badge, EmptyState, PageHeader, PageSkeleton } from "../../components/ui";
import { formatDate } from "../../lib/format";

function StudentMockInterviews() {
  const [interviews, setInterviews] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/mock-interviews/me")
      .then((res) => setInterviews(res.data ?? []))
      .catch((err) => {
        setError(err.message || "Could not load your mock interviews");
        setInterviews([]);
      });
  }, []);

  if (!interviews) return <PageSkeleton stats={2} cards={2} />;

  const [latest, previous] = interviews;
  const change = latest && previous ? Math.round((latest.overallScore - previous.overallScore) * 10) / 10 : null;

  return (
    <div className="page">
      <PageHeader
        title="Mock interviews"
        subtitle="Practice interviews run by your placement office or mentor. Some roles set a minimum score, based on your latest one."
      />

      {error && <Alert tone="error">{error}</Alert>}

      {interviews.length === 0 ? (
        <EmptyState icon={Mic} title="No mock interviews yet">
          Ask your placement office or mentor for a practice round. Your scores and feedback will appear here, and roles with a
          mock-interview benchmark will check your latest score.
        </EmptyState>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat">
              <span className="stat-label">Latest score</span>
              <span className="stat-value">
                {latest.overallScore}
                <span className="stat-unit">/10</span>
              </span>
              <span className="stat-meta">{formatDate(latest.conductedAt)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Since last time</span>
              <span className="stat-value stat-value-sm">
                {change == null ? (
                  "First round"
                ) : (
                  <span className={`trend ${change >= 0 ? "trend-up" : "trend-down"}`}>
                    {change >= 0 ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />}
                    {change >= 0 ? "+" : ""}
                    {change}
                  </span>
                )}
              </span>
              <span className="stat-meta">{interviews.length} round{interviews.length === 1 ? "" : "s"} so far</span>
            </div>
          </div>

          <div className="mock-grid">
            {interviews.map((m, i) => (
              <article key={m.id} className="card mock-card">
                <div className="mock-card-head">
                  <div>
                    <strong>{m.focus || "Mock interview"}</strong>
                    <span className="muted">
                      {formatDate(m.conductedAt)}
                      {m.interviewer?.fullName ? ` · ${m.interviewer.fullName}` : ""}
                    </span>
                  </div>
                  {i === 0 && <Badge tone="brand">Latest</Badge>}
                  <Badge tone={scoreTone(m.overallScore)}>
                    <span className="num">{m.overallScore}/10</span>
                  </Badge>
                </div>
                <MockInterviewScores interview={m} />
                {m.feedback && <p className="mock-feedback">{m.feedback}</p>}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default StudentMockInterviews;
