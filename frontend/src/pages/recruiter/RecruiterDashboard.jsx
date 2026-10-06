import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Award, Briefcase, CalendarClock, FileText, Plus } from "lucide-react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { formatDate } from "../../lib/format";
import JobForm from "../../components/recruiter/JobForm";
import AnimatedNumber from "../../components/common/AnimatedNumber";
import FunnelBars, { FUNNEL_STAGES } from "../../components/common/FunnelBars";
import { Alert, Card, EmptyState, PageHeader, PageSkeleton, StatCard, StatusBadge } from "../../components/ui";

function collegeTargetLabel(targets = []) {
  if (targets.length === 1) return targets[0].college?.name ?? "1 college";
  return `${targets.length} colleges`;
}

function RecruiterDashboard() {
  const { user } = useAuth();
  const toast = useToast();

  const [jobs, setJobs] = useState([]);
  const [overview, setOverview] = useState(null);
  const [funnel, setFunnel] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const [jobsRes, overviewRes, funnelRes] = await Promise.all([
        api.get("/jobs?limit=100"),
        api.get("/analytics/overview"),
        api.get("/analytics/funnel"),
      ]);
      setJobs(jobsRes.data ?? []);
      setOverview(overviewRes.data);
      setFunnel(funnelRes.data ?? {});
      setError("");
    } catch (err) {
      setError(err.message || "Could not load your jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageSkeleton stats={4} cards={2} />;

  const stages = FUNNEL_STAGES.map(([key, label]) => ({ key, label, count: funnel[key] ?? 0 }));
  const openRoles = jobs.filter((j) => j.status === "PUBLISHED").length;

  return (
    <div className="page">
      <PageHeader
        title="Jobs"
        subtitle={`${user?.companyName ? `${user.companyName} · ` : ""}Your roles, applicants and hiring progress`}
        actions={
          !showForm && (
            <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus />
              Post a job
            </button>
          )
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      {showForm && (
        <JobForm
          onCreated={() => {
            setShowForm(false);
            toast.success("Job published. Eligible students can now see it.");
            load();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="stat-grid">
        <StatCard label="Open roles" icon={Briefcase} value={<AnimatedNumber value={openRoles} />} meta={`${jobs.length} total`} />
        <StatCard label="Applications" icon={FileText} value={<AnimatedNumber value={overview?.totalApplications} />} meta="Across your roles" />
        <StatCard label="Interviews" icon={CalendarClock} value={<AnimatedNumber value={overview?.interviews} />} meta="Scheduled or held" />
        <StatCard
          label="Offers accepted"
          icon={Award}
          value={<AnimatedNumber value={overview?.accepted} />}
          meta={`${overview?.offers ?? 0} offer${overview?.offers === 1 ? "" : "s"} sent`}
          tone={overview?.accepted ? "success" : undefined}
        />
      </div>

      <div className="split">
        <Card flush title="Your roles">
          {jobs.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="No roles posted yet"
              action={
                !showForm && (
                  <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
                    Post your first job
                  </button>
                )
              }
            >
              Paste a job description and CampusLink pre-fills the requirements for you.
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Closes</th>
                    <th className="col-actions">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <Link className="cell-title" to={`/recruiter/jobs/${job.id}/candidates`}>
                          {job.title}
                        </Link>
                        <div className="cell-sub">
                          {job.location || "Location not set"} ·{" "}
                          {job.visibility === "SELECTED_COLLEGES"
                            ? collegeTargetLabel(job.targetColleges)
                            : "All colleges"}
                        </div>
                      </td>
                      <td>
                        <StatusBadge kind="job" value={job.status} />
                      </td>
                      <td className="muted">{job.applicationDeadline ? formatDate(job.applicationDeadline) : "—"}</td>
                      <td className="col-actions">
                        <Link className="btn btn-ghost btn-sm" to={`/recruiter/jobs/${job.id}/candidates`}>
                          Candidates
                        </Link>
                        <Link className="btn btn-ghost btn-sm" to={`/recruiter/pipeline?jobId=${job.id}`}>
                          Pipeline
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Hiring funnel"
          subtitle="% converted from the previous stage"
          actions={
            <Link className="btn btn-ghost btn-sm" to="/recruiter/pipeline">
              Open pipeline
            </Link>
          }
        >
          {stages[0].count === 0 ? (
            <EmptyState compact>The funnel fills in as students apply to your roles.</EmptyState>
          ) : (
            <FunnelBars stages={stages} />
          )}
        </Card>
      </div>
    </div>
  );
}

export default RecruiterDashboard;
