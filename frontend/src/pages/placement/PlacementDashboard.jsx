import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Award, BellRing, CalendarDays, Gauge, RefreshCw, SquareKanban, TriangleAlert, Users } from "lucide-react";
import { api } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { formatDate, formatTime, relativeTime } from "../../lib/format";
import AnimatedNumber from "../../components/common/AnimatedNumber";
import FunnelBars, { FUNNEL_STAGES } from "../../components/common/FunnelBars";
import { Alert, Badge, Card, EmptyState, PageHeader, PageSkeleton, Spinner, StatCard } from "../../components/ui";

const BANDS = [
  { key: "Not Ready", label: "Not ready", className: "band-not-ready" },
  { key: "Developing", label: "Developing", className: "band-developing" },
  { key: "Ready", label: "Ready", className: "band-ready" },
  { key: "Highly Employable", label: "Highly employable", className: "band-high" },
];

const RISK_TONE = { High: "danger", Medium: "warning", Low: "neutral" };
const AT_RISK_COLLAPSED = 6;

function RateBar({ value }) {
  return (
    <span className="rate-bar" aria-hidden="true">
      <span style={{ width: `${Math.min(100, value)}%` }} />
    </span>
  );
}

function ReadinessBands({ roles, total }) {
  if (roles.length === 0) return <EmptyState compact>Appears once open roles list skill requirements.</EmptyState>;
  return (
    <div className="band-chart">
      <div className="band-legend" aria-hidden="true">
        {BANDS.map((b) => (
          <span key={b.key}>
            <i className={b.className} />
            {b.label}
          </span>
        ))}
      </div>
      {roles.map((r) => (
        <div key={r.role} className="band-row">
          <span className="band-role">{r.role}</span>
          <div
            className="band-bar"
            role="img"
            aria-label={`${r.role}: ${BANDS.map((b) => `${r.counts[b.key]} ${b.label.toLowerCase()}`).join(", ")}`}
          >
            {BANDS.map((b) =>
              r.counts[b.key] ? (
                <span
                  key={b.key}
                  className={b.className}
                  style={{ width: `${(r.counts[b.key] / Math.max(1, total)) * 100}%` }}
                  title={`${b.label}: ${r.counts[b.key]}`}
                >
                  {r.counts[b.key]}
                </span>
              ) : null
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlacementDashboard() {
  const toast = useToast();
  const [insights, setInsights] = useState(null);
  const [funnel, setFunnel] = useState({});
  const [drives, setDrives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [showAllRisk, setShowAllRisk] = useState(false);
  const [nudging, setNudging] = useState(null);
  const [nudged, setNudged] = useState(() => new Set());

  const load = useCallback(async ({ fresh = false } = {}) => {
    try {
      const [insightsRes, funnelRes, drivesRes] = await Promise.all([
        api.get(`/analytics/insights${fresh ? "?fresh=true" : ""}`),
        api.get("/analytics/funnel"),
        api.get("/drives?limit=100"),
      ]);
      setInsights(insightsRes.data);
      setFunnel(funnelRes.data ?? {});
      const now = Date.now();
      setDrives(
        (drivesRes.data ?? [])
          .filter((d) => d.status !== "CANCELLED" && new Date(d.date).getTime() >= now)
          .sort((a, b) => new Date(a.date) - new Date(b.date))
      );
      setError("");
    } catch (err) {
      setError(err.message || "Could not load placement analytics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const nudge = async (student) => {
    setNudging(student.studentId);
    try {
      await api.post(`/analytics/at-risk/${student.studentId}/nudge`);
      setNudged((prev) => new Set(prev).add(student.studentId));
      toast.success(`${student.name} has been sent next steps`);
    } catch (err) {
      toast.error(err.message || "Could not notify the student");
    } finally {
      setNudging(null);
    }
  };

  if (loading) return <PageSkeleton stats={4} cards={3} />;
  if (!insights) return <div className="page">{error && <Alert tone="error">{error}</Alert>}</div>;

  const { students, offers, joining, documents, packages } = insights;
  const stages = FUNNEL_STAGES.map(([key, label]) => ({ key, label, count: funnel[key] ?? 0 }));
  const atRisk = showAllRisk ? insights.atRisk : insights.atRisk.slice(0, AT_RISK_COLLAPSED);
  const maxHighest = Math.max(1, ...packages.byCompany.map((c) => c.highestLpa ?? 0));

  return (
    <div className="page">
      <PageHeader
        title="Placement overview"
        subtitle={`Campus-wide status, updated ${relativeTime(insights.generatedAt)}.`}
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setRefreshing(true);
                load({ fresh: true });
              }}
              disabled={refreshing}
            >
              {refreshing ? <Spinner /> : <RefreshCw />}
              Refresh
            </button>
            <Link className="btn btn-primary" to="/placement/pipeline">
              <SquareKanban />
              Open pipeline
            </Link>
          </>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="stat-grid">
        <StatCard
          label="Students"
          icon={Users}
          value={<AnimatedNumber value={students.registered} />}
          meta={`${students.placed} placed · ${students.placementRatePct}% placement rate`}
        />
        <StatCard
          label="Placement-ready"
          icon={Gauge}
          value={
            <>
              <AnimatedNumber value={Math.round(students.placementReadyPct)} />
              <small>%</small>
            </>
          }
          progress={students.placementReadyPct}
          meta={`${students.placementReady} of ${students.registered} score ${students.readinessThreshold}+ for a role`}
        />
        <StatCard
          label="Offers"
          icon={Award}
          value={<AnimatedNumber value={offers.made} />}
          meta={`${offers.accepted} accepted · ${offers.pending} pending · ${offers.deferred} deferred`}
          tone={offers.accepted ? "success" : undefined}
        />
        <StatCard
          label="Drives"
          icon={CalendarDays}
          value={<AnimatedNumber value={insights.drives.upcoming} />}
          meta={insights.drives.active ? `${insights.drives.active} running now` : "Upcoming"}
        />
      </div>

      <Card
        flush
        title="Students at risk of staying unplaced"
        subtitle="Rule-based flags from applications, eligibility, readiness, rejections, attendance and profile completeness"
        actions={<Badge tone={insights.atRiskTotal ? "warning" : "success"}>{insights.atRiskTotal} flagged</Badge>}
      >
        {insights.atRisk.length === 0 ? (
          <EmptyState compact>No unplaced students are currently flagged.</EmptyState>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table risk-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Risk</th>
                    <th>Why</th>
                    <th className="col-num">Best readiness</th>
                    <th className="col-actions">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {atRisk.map((s) => (
                    <tr key={s.studentId}>
                      <td>
                        <div className="cell-title">{s.name}</div>
                        <div className="cell-sub">
                          {s.branch || "No branch"} · CGPA {s.cgpa || "—"} · eligible for {s.eligibleOpenRoles} role
                          {s.eligibleOpenRoles === 1 ? "" : "s"}
                        </div>
                      </td>
                      <td>
                        <Badge tone={RISK_TONE[s.level]}>
                          {s.level} · {s.score}
                        </Badge>
                      </td>
                      <td>
                        <ul className="risk-reasons">
                          {s.factors.slice(0, 3).map((f) => (
                            <li key={f.reason}>{f.reason}</li>
                          ))}
                          {s.factors.length > 3 && <li className="muted">+{s.factors.length - 3} more</li>}
                        </ul>
                      </td>
                      <td className="col-num">
                        {s.bestReadiness ?? "—"}
                        {s.bestRole && <div className="cell-sub">{s.bestRole}</div>}
                      </td>
                      <td className="col-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => nudge(s)}
                          disabled={nudging === s.studentId || nudged.has(s.studentId)}
                        >
                          {nudging === s.studentId ? <Spinner /> : <BellRing />}
                          {nudged.has(s.studentId) ? "Sent" : "Send next steps"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {insights.atRisk.length > AT_RISK_COLLAPSED && (
              <div className="card-more">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAllRisk((v) => !v)}>
                  {showAllRisk ? "Show fewer" : `Show all ${insights.atRisk.length}`}
                </button>
              </div>
            )}
          </>
        )}
      </Card>

      <div className="split">
        <Card title="Placement funnel" subtitle="% converted from the previous stage">
          {stages[0].count === 0 ? <EmptyState compact>The funnel fills in as students apply.</EmptyState> : <FunnelBars stages={stages} />}
        </Card>

        <Card
          flush
          title="Upcoming drives"
          actions={
            <Link className="btn btn-ghost btn-sm" to="/placement/drives">
              All drives
            </Link>
          }
        >
          {drives.length === 0 ? (
            <EmptyState compact icon={CalendarDays}>
              No drives scheduled.
            </EmptyState>
          ) : (
            <ul className="list">
              {drives.slice(0, 4).map((d) => {
                const date = new Date(d.date);
                return (
                  <li key={d.id} className="list-row">
                    <div className="date-chip">
                      <span>{date.toLocaleString(undefined, { month: "short" })}</span>
                      <strong>{date.getDate()}</strong>
                    </div>
                    <div className="list-row-main">
                      <strong>{d.company?.name ?? "Company"}</strong>
                      <span>
                        {d.job?.title ?? "Role"} · {formatTime(d.date)}
                        {d.venue ? ` · ${d.venue}` : ""}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="split split-even">
        <Card flush title="Branch-wise conversion" subtitle="Placed = accepted an offer">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th className="col-num">Students</th>
                  <th className="col-num">Applied</th>
                  <th className="col-num">Placed</th>
                  <th>Placement rate</th>
                </tr>
              </thead>
              <tbody>
                {insights.branches.map((b) => (
                  <tr key={b.branch}>
                    <td className="cell-title">{b.branch}</td>
                    <td className="col-num">{b.students}</td>
                    <td className="col-num">{b.applied}</td>
                    <td className="col-num">{b.placed}</td>
                    <td>
                      <div className="rate-cell">
                        <RateBar value={b.placementRatePct} />
                        <span className="num">{b.placementRatePct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          flush
          title="Skills in demand"
          subtitle="Placement rate among students who have each skill. An observed pattern, not proof of cause."
        >
          {insights.skills.length === 0 ? (
            <EmptyState compact>No open roles list skills yet.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Skill</th>
                    <th className="col-num">Roles</th>
                    <th className="col-num">Students</th>
                    <th>Placed</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.skills.map((s) => (
                    <tr key={s.skill}>
                      <td className="cell-title">{s.skill}</td>
                      <td className="col-num">{s.demandRoles}</td>
                      <td className="col-num">{s.students}</td>
                      <td>
                        <div className="rate-cell">
                          <RateBar value={s.placementRatePct} />
                          <span className="num">{s.placementRatePct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="split split-even">
        <Card title="Readiness by role" subtitle={`All ${students.registered} students, scored against each open role's skills`}>
          <ReadinessBands roles={insights.readinessByRole} total={students.registered} />
        </Card>

        <Card title="Packages" subtitle="Excludes withdrawn offers">
          {packages.overall.offers === 0 ? (
            <EmptyState compact>No offers with a CTC yet.</EmptyState>
          ) : (
            <div className="stack">
              <dl className="kv-grid">
                <div className="kv">
                  <dt>Average</dt>
                  <dd className="num">₹{packages.overall.avgLpa} LPA</dd>
                </div>
                <div className="kv">
                  <dt>Median</dt>
                  <dd className="num">₹{packages.overall.medianLpa} LPA</dd>
                </div>
                <div className="kv">
                  <dt>Highest</dt>
                  <dd className="num">₹{packages.overall.highestLpa} LPA</dd>
                </div>
              </dl>
              <div className="package-bars">
                {packages.byCompany.map((c) => (
                  <div key={c.company} className="package-row">
                    <span className="package-name">{c.company}</span>
                    <span className="package-track" aria-hidden="true">
                      <span className="package-avg" style={{ width: `${((c.avgLpa ?? 0) / maxHighest) * 100}%` }} />
                      <span className="package-high" style={{ left: `${((c.highestLpa ?? 0) / maxHighest) * 100}%` }} />
                    </span>
                    <span className="package-value num">
                      ₹{c.avgLpa} <span className="muted">/ {c.highestLpa}</span>
                    </span>
                  </div>
                ))}
                <p className="field-hint">Bar = average LPA, tick = highest. {packages.byMonth.length > 1 ? "" : "Month-by-month trends appear once offers span more than one month."}</p>
              </div>
              {packages.byMonth.length > 1 && (
                <div className="month-trend">
                  {packages.byMonth.map((m) => (
                    <div key={m.month} className="month-col" title={`${m.month}: avg ₹${m.avgLpa} LPA, ${m.offers} offers`}>
                      <span className="month-bar" style={{ height: `${((m.avgLpa ?? 0) / maxHighest) * 100}%` }} />
                      <small>{m.month.slice(5)}/{m.month.slice(2, 4)}</small>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card flush title="Recruiter engagement" subtitle="Active = activity in the last 30 days · Repeat = hired for 2+ roles, drives or months">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Status</th>
                <th className="col-num">Open roles</th>
                <th className="col-num">Drives</th>
                <th className="col-num">Applications</th>
                <th className="col-num">Offers</th>
                <th className="col-num">Accepted</th>
                <th className="col-num">Joined</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {insights.recruiters.map((r) => (
                <tr key={r.company}>
                  <td className="cell-title">{r.company}</td>
                  <td>
                    <div className="row">
                      <Badge tone={r.engagement === "Active" ? "success" : "neutral"}>{r.engagement}</Badge>
                      {r.repeatHirer && (
                        <Badge tone="brand" plain>
                          Repeat
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="col-num">{r.openJobs}</td>
                  <td className="col-num">{r.drives}</td>
                  <td className="col-num">{r.applications}</td>
                  <td className="col-num">{r.offers}</td>
                  <td className="col-num">{r.accepted}</td>
                  <td className="col-num">{r.joined}</td>
                  <td className="muted">{r.lastActivity ? formatDate(r.lastActivity) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Offers, joining and documents"
        actions={
          <Link className="btn btn-ghost btn-sm" to="/placement/offers">
            Manage offers
          </Link>
        }
      >
        <div className="summary-columns">
          <dl>
            <dt>Offers</dt>
            <dd>
              <span>Awaiting reply</span>
              <strong className="num">{offers.pending}</strong>
            </dd>
            <dd>
              <span>Deferred</span>
              <strong className="num">{offers.deferred}</strong>
            </dd>
            <dd>
              <span>Declined</span>
              <strong className="num">{offers.declined}</strong>
            </dd>
            <dd>
              <span>Withdrawn</span>
              <strong className="num">{offers.withdrawn}</strong>
            </dd>
            <dd>
              <span>Pre-placement offers</span>
              <strong className="num">{offers.ppo}</strong>
            </dd>
          </dl>
          <dl>
            <dt>Joining</dt>
            <dd>
              <span>Joined</span>
              <strong className="num">{joining.joined}</strong>
            </dd>
            <dd>
              <span>Joining pending</span>
              <strong className="num">{joining.pending}</strong>
            </dd>
            <dd>
              <span>Did not join</span>
              <strong className="num">{joining.didNotJoin}</strong>
            </dd>
          </dl>
          <dl>
            <dt>Documents</dt>
            <dd>
              <span>Awaiting review</span>
              <strong className="num">{documents.awaitingReview}</strong>
            </dd>
            <dd>
              <span>Not yet submitted</span>
              <strong className="num">{documents.notSubmitted}</strong>
            </dd>
            <dd className={documents.overdue ? "is-alert" : ""}>
              <span>
                {documents.overdue > 0 && <TriangleAlert aria-hidden="true" />}
                Overdue
              </span>
              <strong className="num">{documents.overdue}</strong>
            </dd>
            <dd>
              <span>Verified</span>
              <strong className="num">
                {documents.verified} / {documents.total}
              </strong>
            </dd>
          </dl>
        </div>
      </Card>
    </div>
  );
}

export default PlacementDashboard;
