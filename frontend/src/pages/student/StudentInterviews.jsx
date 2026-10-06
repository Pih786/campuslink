import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Clock, ExternalLink, MapPin, Users } from "lucide-react";
import { api } from "../../services/api";
import { dayLabel, formatTime } from "../../lib/format";
import { Alert, EmptyState, PageHeader, PageSkeleton, StatusBadge } from "../../components/ui";

function StudentInterviews() {
  const [interviews, setInterviews] = useState([]);
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/interviews")
      .then((res) => {
        setInterviews(res.data ?? []);
        setLoadedAt(Date.now());
      })
      .catch((err) => setError(err.message || "Could not load your interviews"))
      .finally(() => setLoading(false));
  }, []);

  const { upcoming, past } = useMemo(() => {
    const up = [];
    const done = [];
    for (const iv of interviews) {
      const end = new Date(iv.scheduledAt).getTime() + (iv.duration ?? 30) * 60000;
      if (iv.status === "SCHEDULED" && end >= loadedAt) up.push(iv);
      else done.push(iv);
    }
    up.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    done.sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
    return { upcoming: up, past: done };
  }, [interviews, loadedAt]);

  if (loading) return <PageSkeleton cards={2} />;

  const renderRow = (iv) => {
    const date = new Date(iv.scheduledAt);
    return (
      <article key={iv.id} className="card schedule-row">
        <div className="date-chip date-chip-lg">
          <span>{date.toLocaleString(undefined, { month: "short" })}</span>
          <strong>{date.getDate()}</strong>
        </div>
        <div className="schedule-row-main">
          <div className="schedule-row-title">
            <h3>{iv.application?.job?.company?.name ?? "Interview"}</h3>
            <StatusBadge kind="interview" value={iv.status} />
          </div>
          <p>
            {iv.round ?? "Interview"} round · {iv.application?.job?.title ?? "Role"}
          </p>
          <div className="meta">
            <span>
              <Clock aria-hidden="true" />
              {dayLabel(iv.scheduledAt)}, {formatTime(iv.scheduledAt)} · {iv.duration ?? 30} min
            </span>
            {iv.venue && (
              <span>
                <MapPin aria-hidden="true" />
                {iv.venue}
              </span>
            )}
            {iv.panel && (
              <span>
                <Users aria-hidden="true" />
                {iv.panel}
              </span>
            )}
            {iv.meetingUrl && (
              <a href={iv.meetingUrl} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" />
                Join meeting
              </a>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="page">
      <PageHeader title="Interviews" subtitle="Your scheduled rounds and past interviews." />

      {error && <Alert tone="error">{error}</Alert>}

      {interviews.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No interviews yet">
          When a recruiter schedules a round with you, the time, venue and meeting link will appear here.
        </EmptyState>
      ) : (
        <>
          <h2 className="section-title">
            Upcoming <span className="count">{upcoming.length}</span>
          </h2>
          {upcoming.length === 0 ? (
            <EmptyState compact>No upcoming interviews.</EmptyState>
          ) : (
            <div className="stack">{upcoming.map(renderRow)}</div>
          )}

          {past.length > 0 && (
            <>
              <h2 className="section-title">
                Past <span className="count">{past.length}</span>
              </h2>
              <div className="stack is-past">{past.map(renderRow)}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default StudentInterviews;
