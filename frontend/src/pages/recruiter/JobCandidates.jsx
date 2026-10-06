import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Mail, RefreshCw, SquareKanban, Users, Zap } from "lucide-react";
import { api } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import MatchScore from "../../components/common/MatchScore";
import ScoreBreakdown from "../../components/common/ScoreBreakdown";
import ResumeButton from "../../components/common/ResumeButton";
import PredictiveLikelihoodPanel from "../../components/recruiter/PredictiveLikelihoodPanel";
import { Alert, Avatar, EmptyState, PageHeader, PageSkeleton, Spinner } from "../../components/ui";

const FACTOR_LABELS = {
  skill_match: "skills",
  education: "academics",
  assessment: "verified assessments",
  projects: "projects",
  certifications: "certifications",
  experience: "experience",
};

// One line on why this candidate sits where they do in the ranking.
function rankingNote(candidate, next) {
  const b = candidate.breakdown;
  if (!b || typeof b !== "object") return null;
  const entries = Object.entries(FACTOR_LABELS).filter(([k]) => b[k] != null);
  const strongest = entries.filter(([k]) => b[k] >= 75).map(([, l]) => l);
  const weakest = entries.filter(([k]) => b[k] < 40).map(([, l]) => l);
  const parts = [];
  if (strongest.length) parts.push(`Strong on ${strongest.join(", ")}`);
  if (weakest.length) parts.push(`weak on ${weakest.join(", ")}`);
  let note = parts.join("; ");
  if (next && next.breakdown) {
    const leads = entries
      .map(([k, l]) => ({ l, diff: (b[k] ?? 0) - (next.breakdown[k] ?? 0) }))
      .filter((d) => d.diff > 0)
      .sort((a, z) => z.diff - a.diff);
    if (leads.length && candidate.score > next.score) {
      note += `${note ? ". " : ""}Ranked above ${next.fullName} mainly on ${leads[0].l}`;
    } else if (candidate.score === next.score) {
      note += `${note ? ". " : ""}Tied with ${next.fullName}`;
    }
  }
  return note ? `${note}.` : null;
}

function CandidateCard({ candidate, rank, next }) {
  const matched = candidate.matchedSkills ?? [];
  const gaps = candidate.gapSkills ?? [];
  const explanation = candidate.explanation ?? [];
  const note = rankingNote(candidate, next);

  return (
    <article className="card candidate-card">
      <div className="candidate-head">
        <span className="candidate-rank num">#{rank}</span>
        <Avatar name={candidate.fullName} />
        <div className="candidate-id">
          <h3>{candidate.fullName ?? "Candidate"}</h3>
          <div className="meta">
            <span>
              {candidate.department ?? "—"} · CGPA {candidate.cgpa ?? "—"}
            </span>
            {candidate.email && (
              <a href={`mailto:${candidate.email}`}>
                <Mail aria-hidden="true" />
                {candidate.email}
              </a>
            )}
          </div>
        </div>
        <MatchScore value={candidate.score} />
      </div>

      {candidate.applied && candidate.hasResume && (
        <div className="candidate-links">
          <ResumeButton studentId={candidate.studentId} name={candidate.fullName} />
        </div>
      )}

      {note && <p className="candidate-note">{note}</p>}

      <div className="candidate-skills">
        <div>
          <span className="jd-result-label">Matched · {matched.length}</span>
          <div className="tag-list">
            {matched.length === 0 ? (
              <span className="muted">None</span>
            ) : (
              matched.map((s) => (
                <span key={s} className="tag tag-success">
                  {s}
                </span>
              ))
            )}
          </div>
        </div>
        <div>
          <span className="jd-result-label">Gaps · {gaps.length}</span>
          <div className="tag-list">
            {gaps.length === 0 ? (
              <span className="muted">None</span>
            ) : (
              gaps.map((s) => (
                <span key={s} className="tag tag-warning">
                  {s}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {(candidate.breakdown || explanation.length > 0) && (
        <details className="candidate-why">
          <summary>How this score was calculated</summary>
          <ScoreBreakdown breakdown={candidate.breakdown} />
          {explanation.length > 0 && (
            <ul className="bullet-list">
              {explanation.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </details>
      )}

      {candidate.aiUnavailable && (
        <Alert tone="warning">
          The matching service was unavailable, so this score uses simple skill overlap only. Recompute later for a full
          score.
        </Alert>
      )}
    </article>
  );
}

// The job's opt-in rule: eligible applicants at or above the threshold are
// shortlisted automatically (and told why); everyone else waits for a person.
function AutoShortlistRule({ job, onSaved }) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(Boolean(job.autoShortlist));
  const [minScore, setMinScore] = useState(job.autoShortlistMinScore ?? 70);
  const [saving, setSaving] = useState(false);
  const dirty = enabled !== Boolean(job.autoShortlist) || Number(minScore) !== (job.autoShortlistMinScore ?? 70);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put(`/jobs/${job.id}`, { autoShortlist: enabled, autoShortlistMinScore: Number(minScore) || 70 });
      onSaved(res.data);
      toast.success(enabled ? "Auto-shortlisting is on. Current applicants who qualify are being shortlisted." : "Auto-shortlisting is off");
    } catch (err) {
      toast.error(err.message || "Could not save the rule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card auto-shortlist">
      <div className="auto-shortlist-head">
        <Zap aria-hidden="true" />
        <div>
          <h2 className="card-title">Auto-shortlist</h2>
          <p className="card-subtitle">
            {job.autoShortlist
              ? `On: eligible applicants scoring ${job.autoShortlistMinScore} or more are shortlisted as they apply, and told why.`
              : "Off: you move every applicant yourself."}
          </p>
        </div>
      </div>
      <div className="auto-shortlist-controls">
        <label className="check">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>Shortlist automatically</span>
        </label>
        <label className="auto-shortlist-min">
          <span>at a match score of</span>
          <span className="auto-shortlist-num">
            <input type="number" min="0" max="100" value={minScore} onChange={(e) => setMinScore(e.target.value)} disabled={!enabled} aria-label="Minimum match score" />
          </span>
          <span>or more</span>
        </label>
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={!dirty || saving}>
          {saving && <Spinner />}
          Save rule
        </button>
      </div>
    </section>
  );
}

function JobCandidates() {
  const { jobId } = useParams();
  const toast = useToast();

  const [candidates, setCandidates] = useState([]);
  const [screening, setScreening] = useState(null);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [jobRes, candidatesRes] = await Promise.all([
        api.get(`/jobs/${jobId}`),
        api.get(`/matching/job/${jobId}/candidates`),
      ]);
      setJob(jobRes.data);
      setCandidates(candidatesRes.data?.candidates ?? []);
      setScreening(candidatesRes.data?.screening ?? null);
    } catch (err) {
      setError(err.message || "Could not load candidates");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRecompute = async () => {
    setComputing(true);
    try {
      const res = await api.post(`/matching/job/${jobId}`);
      setCandidates(res.data?.candidates ?? []);
      setScreening(res.data?.screening ?? null);
      const auto = res.data?.autoShortlisted ?? 0;
      toast.success(auto > 0 ? `Match scores recalculated. ${auto} applicant${auto === 1 ? "" : "s"} auto-shortlisted.` : "Match scores recalculated");
    } catch (err) {
      toast.error(err.message || "Could not recalculate matches");
    } finally {
      setComputing(false);
    }
  };

  if (loading) return <PageSkeleton cards={3} />;

  const ranked = [...candidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return (
    <div className="page">
      <PageHeader
        back={{ to: "/recruiter/dashboard", label: "Jobs" }}
        title={job?.title || "Candidates"}
        subtitle={`${ranked.length} eligible candidate${ranked.length === 1 ? "" : "s"}, ranked by match score`}
        actions={
          <>
            <Link className="btn btn-secondary" to={`/recruiter/pipeline?jobId=${jobId}`}>
              <SquareKanban />
              Open pipeline
            </Link>
            <button type="button" className="btn btn-secondary" onClick={handleRecompute} disabled={computing}>
              {computing ? <Spinner /> : <RefreshCw />}
              Recalculate
            </button>
          </>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      {job && <AutoShortlistRule key={`${job.autoShortlist}-${job.autoShortlistMinScore}`} job={job} onSaved={setJob} />}

      {screening && screening.evaluated > 0 && (
        <section className="card screening">
          <div className="screening-figures">
            <div>
              <strong className="num">{screening.evaluated}</strong>
              <span>students checked</span>
            </div>
            <div>
              <strong className="num">{screening.eligible}</strong>
              <span>eligible and ranked</span>
            </div>
            <div>
              <strong className="num">{screening.excluded}</strong>
              <span>excluded by hard requirements</span>
            </div>
          </div>
          {screening.blockers.length > 0 && (
            <div className="screening-blockers">
              <span className="criteria-label">Why students were excluded (a student can fail several)</span>
              <ul>
                {screening.blockers.slice(0, 6).map((b) => (
                  <li key={b.reason}>
                    <span>{b.reason}</span>
                    <span className="screening-bar" aria-hidden="true">
                      <span style={{ width: `${(b.students / screening.excluded) * 100}%` }} />
                    </span>
                    <span className="num">{b.students}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {ranked.length === 0 ? (
        <EmptyState icon={Users} title="No eligible candidates yet">
          Candidates appear once students meet this role's CGPA, branch, backlog and required-skill criteria.
        </EmptyState>
      ) : (
        <div className="stack">
          {ranked.map((c, i) => (
            <CandidateCard key={c.studentId} candidate={c} rank={i + 1} next={ranked[i + 1]} />
          ))}
        </div>
      )}

      {ranked.length > 0 && <PredictiveLikelihoodPanel jobId={jobId} />}
    </div>
  );
}

export default JobCandidates;
