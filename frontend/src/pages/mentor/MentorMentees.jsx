import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Users } from "lucide-react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { RiskBadge } from "../../components/mentoring/EscalationList";
import { Alert, Avatar, Badge, EmptyState, PageHeader, PageSkeleton } from "../../components/ui";
import { formatDate } from "../../lib/format";

const SORTS = {
  risk: (a, b) => (b.risk?.score ?? -1) - (a.risk?.score ?? -1),
  name: (a, b) => a.user.fullName.localeCompare(b.user.fullName),
  followUp: (a, b) => (a.nextFollowUp ? +new Date(a.nextFollowUp) : Infinity) - (b.nextFollowUp ? +new Date(b.nextFollowUp) : Infinity),
};

// Mentors see their own mentees; the placement office sees every mentored student.
export function MenteeTable({ mentees, showMentor, linkFor }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Student</th>
            {showMentor && <th>Mentor</th>}
            <th className="num">Profile</th>
            <th className="num">Applied</th>
            <th>Risk</th>
            <th>Next follow-up</th>
          </tr>
        </thead>
        <tbody>
          {mentees.map((m) => (
            <tr key={m.id}>
              <td>
                <div className="cell-person">
                  <Avatar name={m.user.fullName} />
                  <div>
                    <Link className="cell-title" to={linkFor(m.id)}>
                      {m.user.fullName}
                    </Link>
                    <div className="cell-sub">{[m.department, m.cgpa ? `CGPA ${m.cgpa}` : null].filter(Boolean).join(" · ")}</div>
                  </div>
                </div>
              </td>
              {showMentor && <td>{m.mentor?.fullName ?? "—"}</td>}
              <td className="num">{m.profileCompletion}%</td>
              <td className="num">{m.applications}</td>
              <td>
                <div className="row-tight">
                  {m.placed ? <Badge tone="success">Placed</Badge> : m.risk ? <RiskBadge level={m.risk.level} score={m.risk.score} /> : <span className="muted">Low</span>}
                  {m.openEscalation && <Badge tone="warning">Escalated</Badge>}
                </div>
              </td>
              <td className={m.nextFollowUp ? "" : "muted"}>{m.nextFollowUp ? formatDate(m.nextFollowUp) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MentorMentees() {
  const { user } = useAuth();
  const [mentees, setMentees] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("risk");

  useEffect(() => {
    api
      .get("/mentoring/mentees")
      .then((res) => setMentees(res.data ?? []))
      .catch((err) => setError(err.message || "Could not load mentees"));
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (mentees ?? [])
      .filter((m) => !q || [m.user.fullName, m.user.email, m.department].filter(Boolean).join(" ").toLowerCase().includes(q))
      .sort(SORTS[sort]);
  }, [mentees, query, sort]);

  if (!mentees && !error) return <PageSkeleton cards={1} />;

  return (
    <div className="page">
      <PageHeader title="Mentees" subtitle={`${mentees?.length ?? 0} students assigned to you at ${user?.collegeName ?? "your college"}`} />
      {error && <Alert tone="error">{error}</Alert>}
      {mentees?.length === 0 ? (
        <EmptyState icon={Users} title="No mentees yet">
          Your placement office assigns students to you. You'll get a notification when they do.
        </EmptyState>
      ) : (
        <>
          <div className="toolbar">
            <label className="search-input">
              <Search aria-hidden="true" />
              <input type="search" placeholder="Search mentees" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search mentees" />
            </label>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
              <option value="risk">Highest risk first</option>
              <option value="followUp">Next follow-up</option>
              <option value="name">Name</option>
            </select>
          </div>
          <div className="card card-flush">
            <MenteeTable mentees={visible} linkFor={(id) => `/mentor/mentees/${id}`} />
            {visible.length === 0 && <EmptyState compact>No mentees match your search.</EmptyState>}
          </div>
        </>
      )}
    </div>
  );
}

export default MentorMentees;
