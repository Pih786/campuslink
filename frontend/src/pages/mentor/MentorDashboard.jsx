import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, GraduationCap, LifeBuoy, Users } from "lucide-react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { ESCALATION_STATUS, RiskBadge, riskLevel } from "../../components/mentoring/EscalationList";
import { Alert, Avatar, Badge, Card, EmptyState, PageHeader, PageSkeleton, StatCard } from "../../components/ui";
import { firstName, formatDate, greeting, relativeTime } from "../../lib/format";

function MentorDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/mentoring/overview")
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message || "Could not load your dashboard"));
  }, []);

  if (!data && !error) return <PageSkeleton stats={4} cards={2} />;

  const stats = data?.stats;

  return (
    <div className="page">
      <PageHeader
        title={`${greeting()}, ${firstName(user?.fullName)}`}
        subtitle={`Your mentees at ${user?.collegeName ?? "your college"}, and who needs you this week.`}
      />
      {error && <Alert tone="error">{error}</Alert>}

      {stats && (
        <div className="stat-grid">
          <StatCard icon={Users} label="Mentees" value={stats.mentees} meta={`${stats.placed} placed`} />
          <StatCard icon={AlertTriangle} label="At risk" value={stats.atRisk} meta="Medium or high risk" />
          <StatCard icon={LifeBuoy} label="Open escalations" value={stats.openEscalations} />
          <StatCard icon={CalendarClock} label="Follow-ups this week" value={stats.followUpsThisWeek} />
        </div>
      )}

      {data && (
        <div className="split">
          <Card
            title="Escalations to handle"
            actions={
              <Link to="/mentor/escalations" className="btn btn-ghost btn-sm">
                View all
              </Link>
            }
          >
            {data.escalations.length === 0 ? (
              <EmptyState compact icon={LifeBuoy} title="Nothing escalated">
                When the placement office asks you to support a student, it appears here.
              </EmptyState>
            ) : (
              <ul className="mini-list">
                {data.escalations.map((e) => (
                  <li key={e.id}>
                    <div className="cell-person">
                      <Avatar name={e.student.user.fullName} size="sm" />
                      <div>
                        <Link className="cell-title" to={`/mentor/mentees/${e.student.id}`}>
                          {e.student.user.fullName}
                        </Link>
                        <div className="cell-sub">{e.reason}</div>
                      </div>
                    </div>
                    <div className="row-tight">
                      {e.riskScore != null && <RiskBadge level={riskLevel(e.riskScore)} score={e.riskScore} />}
                      <Badge tone={ESCALATION_STATUS[e.status].tone}>{ESCALATION_STATUS[e.status].label}</Badge>
                      <span className="muted">{relativeTime(e.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Upcoming follow-ups">
            {data.followUps.length === 0 ? (
              <EmptyState compact icon={CalendarClock}>
                Add a follow-up date to a note to see it here.
              </EmptyState>
            ) : (
              <ul className="mini-list">
                {data.followUps.map((f) => (
                  <li key={f.studentId}>
                    <Link className="cell-title" to={`/mentor/mentees/${f.studentId}`}>
                      {f.name}
                    </Link>
                    <span className="muted">{formatDate(f.followUpAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {stats?.mentees === 0 && (
        <EmptyState icon={GraduationCap} title="No mentees yet">
          Your college's placement office assigns students to you from their Mentoring page.
        </EmptyState>
      )}
    </div>
  );
}

export default MentorDashboard;
