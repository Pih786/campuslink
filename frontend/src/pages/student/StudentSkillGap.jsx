import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CircleCheck, CodeXml, Database, Target, TriangleAlert } from "lucide-react";
import { api } from "../../services/api";
import { Alert, Badge, Card, EmptyState, PageHeader, PageSkeleton } from "../../components/ui";
import MatchScore from "../../components/common/MatchScore";
import SkillLearnPanel from "../../components/learning/SkillLearnPanel";

function StudentSkillGap() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState([]);
  const [gap, setGap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gapLoading, setGapLoading] = useState(false);
  const [error, setError] = useState("");
  const [learnSkill, setLearnSkill] = useState("");

  const selectedJobId = searchParams.get("jobId") ?? jobs[0]?.jobId ?? "";
  const selectedJob = jobs.find((j) => j.jobId === selectedJobId);

  const requestedJobId = searchParams.get("jobId");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await api.get("/matching/student/me/jobs");
        const eligible = res.data ?? [];
        // Readiness links to roles the student may not qualify for yet;
        // add those as an extra option rather than silently ignoring them.
        if (requestedJobId && !eligible.some((j) => j.jobId === requestedJobId)) {
          const jobRes = await api.get(`/jobs/${requestedJobId}`);
          const job = jobRes.data;
          eligible.unshift({ jobId: job.id, title: job.title, companyName: job.company?.name, notEligible: true });
        }
        if (!cancelled) setJobs(eligible);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load your matched roles");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // Only the initial deep link matters; later changes come from the picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedJobId) return;
    setGapLoading(true);
    api
      .get(`/students/me/skill-gaps?jobId=${selectedJobId}`)
      .then((res) => setGap(res.data))
      .catch((err) => setError(err.message || "Could not load the skill gap"))
      .finally(() => setGapLoading(false));
  }, [selectedJobId]);

  if (loading) return <PageSkeleton cards={2} />;

  const matched = gap?.matched ?? [];
  const missing = gap?.missing ?? [];
  const activeLearnSkill = missing.includes(learnSkill) ? learnSkill : missing[0];

  return (
    <div className="page">
      <PageHeader title="Skill gap" subtitle="Compare your skills against a specific role's requirements." />

      {error && <Alert tone="error">{error}</Alert>}

      {jobs.length === 0 ? (
        <EmptyState icon={Target} title="Nothing to compare yet">
          Once you're eligible for at least one role, you can compare your skills against it here.
        </EmptyState>
      ) : (
        <>
          <div className="field compare-picker">
            <label htmlFor="gap-job">Compare against</label>
            <select
              id="gap-job"
              value={selectedJobId}
              onChange={(e) => setSearchParams({ jobId: e.target.value }, { replace: true })}
            >
              {jobs.map((m) => (
                <option key={m.jobId} value={m.jobId}>
                  {m.title ?? "Role"} · {m.companyName ?? "Company"}
                  {m.notEligible ? " (not eligible yet)" : ""}
                </option>
              ))}
            </select>
          </div>

          {gapLoading || !gap ? (
            <div className="skeleton skeleton-card" />
          ) : (
            <>
              {selectedJob && (
                <section className="card gap-summary">
                  <div>
                    <h2 className="card-title">{selectedJob.title}</h2>
                    <p className="card-subtitle">{selectedJob.companyName}</p>
                  </div>
                  <div className="gap-summary-figures">
                    <div>
                      <strong className="num">
                        {matched.length}/{matched.length + missing.length}
                      </strong>
                      <span>required skills covered</span>
                    </div>
                    {selectedJob.notEligible ? (
                      <Badge tone="warning">Not eligible yet</Badge>
                    ) : (
                      <MatchScore value={selectedJob.score} />
                    )}
                  </div>
                </section>
              )}

              <div className="split-even split">
                <Card title="Skills you have" subtitle={`${matched.length} matched`}>
                  {matched.length === 0 ? (
                    <EmptyState compact>None of this role's skills are on your profile yet.</EmptyState>
                  ) : (
                    <ul className="skill-lines">
                      {matched.map((s) => (
                        <li key={s}>
                          <CircleCheck className="icon-success" aria-hidden="true" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card title="Skills to build" subtitle={missing.length ? `${missing.length} to close` : "Nothing missing"}>
                  {missing.length === 0 ? (
                    <EmptyState compact>You cover every skill this role lists.</EmptyState>
                  ) : (
                    <>
                      <ul className="skill-lines">
                        {missing.map((s) => (
                          <li key={s}>
                            <TriangleAlert className="icon-warning" aria-hidden="true" />
                            {s}
                          </li>
                        ))}
                      </ul>
                      <div className="gap-actions">
                        <span className="field-hint">Prove a skill to raise your match:</span>
                        <div className="row">
                          <Link className="btn btn-secondary btn-sm" to="/student/code-lab">
                            <CodeXml />
                            Coding lab
                          </Link>
                          <Link className="btn btn-secondary btn-sm" to="/student/sql-lab">
                            <Database />
                            SQL lab
                          </Link>
                          <Link className="btn btn-secondary btn-sm" to="/student/assessments">
                            Assessments
                          </Link>
                        </div>
                      </div>
                    </>
                  )}
                </Card>
              </div>

              {missing.length > 0 && (
                <Card
                  title="Learn the missing skills"
                  subtitle="Free courses, docs and videos for each skill this role needs. Track what you finish."
                  actions={
                    <Link className="btn btn-ghost btn-sm" to="/student/learning">
                      Full learning plan
                    </Link>
                  }
                >
                  <div className="tabs" role="tablist" aria-label="Missing skills">
                    {missing.map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="tab"
                        className="tab"
                        aria-selected={activeLearnSkill === s}
                        onClick={() => setLearnSkill(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <SkillLearnPanel key={activeLearnSkill} skill={activeLearnSkill} />
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default StudentSkillGap;
