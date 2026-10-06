import { useCallback, useEffect, useMemo, useState } from "react";
import { Mic, Plus, Search } from "lucide-react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import MockInterviewModal from "../../components/mock-interviews/MockInterviewModal";
import MockInterviewScores, { scoreTone } from "../../components/mock-interviews/MockInterviewScores";
import { Alert, Avatar, Badge, EmptyState, PageHeader, PageSkeleton } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { fetchAllStudents } from "../../lib/students";

// Placement office and mentors: record mock interviews and see every
// student's latest score, which feeds eligibility benchmarks and risk.
function MockInterviewsManager() {
  const { user } = useAuth();
  const [interviews, setInterviews] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [query, setQuery] = useState("");
  const canRecord = user?.role === "PLACEMENT_OFFICER" || user?.role === "MENTOR";

  const load = useCallback(async () => {
    try {
      const [m, all] = await Promise.all([api.get("/mock-interviews"), fetchAllStudents()]);
      setInterviews(m.data ?? []);
      setStudents(all.sort((a, b) => (a.user?.fullName ?? "").localeCompare(b.user?.fullName ?? "")));
    } catch (err) {
      setError(err.message || "Could not load mock interviews");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const latest = new Map();
    for (const m of interviews) if (!latest.has(m.studentId)) latest.set(m.studentId, m.overallScore);
    const scores = [...latest.values()];
    return {
      students: scores.length,
      average: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
      below5: scores.filter((s) => s < 5).length,
      notYet: Math.max(0, students.length - scores.length),
    };
  }, [interviews, students]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return interviews;
    return interviews.filter((m) =>
      [m.student?.user?.fullName, m.student?.department, m.focus].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [interviews, query]);

  if (loading) return <PageSkeleton stats={4} cards={2} />;

  return (
    <div className="page">
      <PageHeader
        title="Mock interviews"
        subtitle="Scores feed job benchmarks, readiness and the at-risk list. Students see your feedback."
        actions={
          canRecord && (
            <button type="button" className="btn btn-primary" onClick={() => setRecording(true)}>
              <Plus />
              Record mock interview
            </button>
          )
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="stat-grid">
        <div className="stat">
          <span className="stat-label">Students assessed</span>
          <span className="stat-value">{summary.students}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Average latest score</span>
          <span className="stat-value">{summary.average ?? "—"}</span>
          <span className="stat-meta">out of 10</span>
        </div>
        <div className="stat">
          <span className="stat-label">Below 5</span>
          <span className="stat-value">{summary.below5}</span>
          <span className="stat-meta">flagged in the risk score</span>
        </div>
        <div className="stat">
          <span className="stat-label">Not yet interviewed</span>
          <span className="stat-value">{summary.notYet}</span>
        </div>
      </div>

      {interviews.length === 0 ? (
        <EmptyState icon={Mic} title="No mock interviews yet" action={canRecord && (
          <button type="button" className="btn btn-primary" onClick={() => setRecording(true)}>
            <Plus />
            Record the first one
          </button>
        )}>
          Record a practice interview to give students feedback and a score recruiters can set a benchmark on.
        </EmptyState>
      ) : (
        <>
          <div className="toolbar">
            <label className="search-input">
              <Search aria-hidden="true" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by student, branch or focus" aria-label="Search mock interviews" />
            </label>
          </div>
          <div className="mock-grid">
            {visible.map((m) => (
              <article key={m.id} className="card mock-card">
                <div className="mock-card-head">
                  <Avatar name={m.student?.user?.fullName} size="sm" />
                  <div>
                    <strong>{m.student?.user?.fullName}</strong>
                    <span className="muted">
                      {m.student?.department ?? "—"} · {formatDate(m.conductedAt)}
                    </span>
                  </div>
                  <Badge tone={scoreTone(m.overallScore)}>
                    <span className="num">{m.overallScore}/10</span>
                  </Badge>
                </div>
                {m.focus && <p className="mock-focus">{m.focus}</p>}
                <MockInterviewScores interview={m} />
                {m.feedback && <p className="mock-feedback">{m.feedback}</p>}
                {m.interviewer?.fullName && <span className="muted mock-by">By {m.interviewer.fullName}</span>}
              </article>
            ))}
          </div>
        </>
      )}

      {recording && (
        <MockInterviewModal
          open
          students={students}
          onClose={() => setRecording(false)}
          onSaved={(saved) => setInterviews((prev) => [{ ...saved, student: students.find((s) => s.id === saved.studentId) }, ...prev])}
        />
      )}
    </div>
  );
}

export default MockInterviewsManager;
