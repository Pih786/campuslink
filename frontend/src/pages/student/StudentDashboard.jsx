import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Award,
  Briefcase,
  CalendarClock,
  CircleCheck,
  Circle,
  ClipboardList,
  FileText,
  HeartHandshake,
  Mail,
  Mic,
  UserRound,
} from "lucide-react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { dayLabel, firstName, formatDate, formatTime, greeting } from "../../lib/format";
import { Alert, Badge, Card, EmptyState, PageHeader, PageSkeleton, StatCard } from "../../components/ui";
import { scoreTone } from "../../components/mock-interviews/MockInterviewScores";
import MatchScore from "../../components/common/MatchScore";
import RoleReadiness from "../../components/student/RoleReadiness";

const ACTIVE_STATUSES = ["APPLIED", "ELIGIBLE", "SHORTLISTED", "ASSESSMENT", "INTERVIEW", "SELECTED", "OFFERED"];

// Same six checks the backend uses for profile completeness.
function profileChecklist(profile) {
  if (!profile) return [];
  return [
    { label: "Set your branch", done: Boolean(profile.department), to: "/student/profile" },
    { label: "Add your CGPA and graduation year", done: profile.cgpa > 0 && Boolean(profile.graduationYear), to: "/student/profile" },
    { label: "Add a phone number", done: Boolean(profile.phone), to: "/student/profile" },
    { label: "Add a resume (upload one, or build it in the CV maker)", done: Boolean(profile.resumeUrl), to: "/student/cv" },
    { label: "Add at least 3 skills", done: (profile.skills?.length ?? 0) >= 3, to: "/student/profile" },
    { label: "Add a project", done: (profile.projects?.length ?? 0) > 0, to: "/student/profile" },
  ];
}

function StudentDashboard() {
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [applications, setApplications] = useState([]);
  const [matches, setMatches] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [readiness, setReadiness] = useState([]);
  const [mentor, setMentor] = useState(null);
  const [assignmentsDue, setAssignmentsDue] = useState([]);
  const [latestMock, setLatestMock] = useState(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      api.get("/students/me"),
      api.get("/applications"),
      api.get("/matching/student/me/jobs"),
      api.get("/interviews"),
      api.get("/students/me/readiness"),
    ])
      .then(([profileRes, applicationsRes, matchesRes, interviewsRes, readinessRes]) => {
        if (cancelled) return;
        setProfile(profileRes.data);
        setApplications(applicationsRes.data ?? []);
        setMatches(matchesRes.data ?? []);
        setInterviews(interviewsRes.data ?? []);
        setReadiness(readinessRes.data?.roles ?? []);
        setLoadedAt(Date.now());
      })
      .catch((err) => !cancelled && setError(err.message || "Could not load your dashboard"))
      .finally(() => !cancelled && setLoading(false));

    // Secondary panels: never block or fail the dashboard.
    api
      .get("/mentoring/me")
      .then((res) => !cancelled && setMentor(res.data.mentor))
      .catch(() => {});
    api
      .get("/assignments/mine")
      .then((res) => {
        if (cancelled) return;
        const now = Date.now();
        setAssignmentsDue(
          (res.data ?? []).filter(
            (s) => s.status === "ASSIGNED" && s.assignment.status === "OPEN" && new Date(s.assignment.dueAt).getTime() > now
          )
        );
      })
      .catch(() => {});
    api
      .get("/mock-interviews/me")
      .then((res) => !cancelled && setLatestMock(res.data?.[0] ?? null))
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <PageSkeleton stats={4} cards={2} />;

  const active = applications.filter((a) => ACTIVE_STATUSES.includes(a.status)).length;
  const offers = applications.filter((a) => ["OFFERED", "ACCEPTED", "JOINED"].includes(a.status));
  const awaitingReply = applications.filter((a) => a.status === "OFFERED").length;
  const upcoming = interviews
    .filter((iv) => iv.status === "SCHEDULED" && new Date(iv.scheduledAt).getTime() >= loadedAt)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const completion = profile?.profileCompletion ?? 0;
  const checklist = profileChecklist(profile);
  const remaining = checklist.filter((item) => !item.done);
  const appliedIds = new Set(applications.map((a) => a.jobId));
  const topMatches = matches.filter((m) => !appliedIds.has(m.jobId)).slice(0, 4);

  return (
    <div className="page">
      <PageHeader
        title={`${greeting()}, ${firstName(user?.fullName) || "there"}`}
        subtitle={
          profile?.department
            ? `${profile.department}${profile.graduationYear ? ` · Class of ${profile.graduationYear}` : ""}`
            : "Here's where your placements stand today."
        }
        actions={
          <Link className="btn btn-primary" to="/student/jobs">
            Browse job matches
            <ArrowRight />
          </Link>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      {awaitingReply > 0 && (
        <Alert tone="success" title={`You have ${awaitingReply === 1 ? "an offer" : `${awaitingReply} offers`} waiting for your reply`}>
          <Link to="/student/offers">Review and respond</Link>
        </Alert>
      )}

      {assignmentsDue.length > 0 && (
        <Alert
          tone="warning"
          title={`${assignmentsDue.length === 1 ? "An assignment is" : `${assignmentsDue.length} assignments are`} waiting for your submission`}
        >
          <Link to="/student/assignments">
            <ClipboardList aria-hidden="true" className="icon-inline" />
            {assignmentsDue[0].assignment.company.name}: {assignmentsDue[0].assignment.title}
            {assignmentsDue.length > 1 ? ` and ${assignmentsDue.length - 1} more` : ""}
          </Link>
        </Alert>
      )}

      <div className="stat-grid">
        <StatCard
          label="Profile"
          icon={UserRound}
          value={
            <>
              {completion}
              <small>%</small>
            </>
          }
          progress={completion}
          meta={completion >= 100 ? "Complete" : `${remaining.length} step${remaining.length === 1 ? "" : "s"} left`}
        />
        <StatCard label="Applications" icon={FileText} value={applications.length} meta={`${active} in progress`} />
        <StatCard
          label="Interviews"
          icon={CalendarClock}
          value={upcoming.length}
          meta={upcoming[0] ? `Next: ${dayLabel(upcoming[0].scheduledAt)}, ${formatTime(upcoming[0].scheduledAt)}` : "None scheduled"}
        />
        <StatCard
          label="Offers"
          icon={Award}
          value={offers.length}
          tone={offers.length > 0 ? "success" : undefined}
          meta={awaitingReply ? `${awaitingReply} awaiting your reply` : "Received so far"}
        />
      </div>

      <div className="split">
        <div className="stack">
          <RoleReadiness roles={readiness} />

          <Card
            flush
            title="Roles you qualify for"
            subtitle="Eligible roles you haven't applied to, best match first"
            actions={
              <Link className="btn btn-ghost btn-sm" to="/student/jobs">
                View all
              </Link>
            }
          >
            {topMatches.length === 0 ? (
              <EmptyState icon={Briefcase} title="No new matches right now">
                {matches.length === 0
                  ? "Add your branch, CGPA and skills so roles you're eligible for can show up here."
                  : "You've applied to every role you currently qualify for."}
              </EmptyState>
            ) : (
              <ul className="list">
                {topMatches.map((m) => (
                  <li key={m.jobId}>
                    <Link className="list-row" to="/student/jobs">
                      <span className="company-mark" aria-hidden="true">
                        {(m.companyName ?? "?").charAt(0)}
                      </span>
                      <div className="list-row-main">
                        <strong>{m.title}</strong>
                        <span>
                          {m.companyName}
                          {m.location ? ` · ${m.location}` : ""}
                        </span>
                      </div>
                      <MatchScore value={m.score} size="sm" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card
            flush
            title="Upcoming interviews"
            actions={
              upcoming.length > 0 && (
                <Link className="btn btn-ghost btn-sm" to="/student/interviews">
                  All
                </Link>
              )
            }
          >
            {upcoming.length === 0 ? (
              <EmptyState compact>Interviews appear here once a recruiter schedules one.</EmptyState>
            ) : (
              <ul className="list">
                {upcoming.slice(0, 3).map((iv) => (
                  <li key={iv.id} className="list-row">
                    <div className="date-chip">
                      <span>{new Date(iv.scheduledAt).toLocaleString(undefined, { month: "short" })}</span>
                      <strong>{new Date(iv.scheduledAt).getDate()}</strong>
                    </div>
                    <div className="list-row-main">
                      <strong>{iv.application?.job?.company?.name ?? "Interview"}</strong>
                      <span>
                        {iv.round ?? "Interview"} · {formatTime(iv.scheduledAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {latestMock && (
            <Card
              title="Latest mock interview"
              actions={
                <Link className="btn btn-ghost btn-sm" to="/student/mock-interviews">
                  Details
                </Link>
              }
            >
              <div className="list-row">
                <span className="resource-icon" aria-hidden="true">
                  <Mic />
                </span>
                <div className="list-row-main">
                  <strong>{latestMock.focus || "Mock interview"}</strong>
                  <span>{formatDate(latestMock.conductedAt)}</span>
                </div>
                <Badge tone={scoreTone(latestMock.overallScore)}>
                  <span className="num">{latestMock.overallScore}/10</span>
                </Badge>
              </div>
            </Card>
          )}

          {mentor && (
            <Card title="Your mentor">
              <div className="list-row mentor-row">
                <span className="resource-icon" aria-hidden="true">
                  <HeartHandshake />
                </span>
                <div className="list-row-main">
                  <strong>{mentor.fullName}</strong>
                  <span>{mentor.designation || "Placement mentor"}</span>
                </div>
                <a className="btn btn-secondary btn-sm" href={`mailto:${mentor.email}`}>
                  <Mail />
                  Email
                </a>
              </div>
            </Card>
          )}

          {remaining.length > 0 && (
            <Card title="Next steps" subtitle="Each one improves which roles you qualify for">
              <ul className="checklist">
                {checklist.map((item) => (
                  <li key={item.label} className={item.done ? "done" : ""}>
                    {item.done ? <CircleCheck aria-hidden="true" /> : <Circle aria-hidden="true" />}
                    {item.done ? <span>{item.label}</span> : <Link to={item.to}>{item.label}</Link>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default StudentDashboard;
