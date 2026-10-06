import { Award, CalendarClock, ClipboardList, GripVertical } from "lucide-react";
import { formatDateTime, formatLpa, relativeTime } from "../../lib/format";
import { statusInfo } from "../../lib/status";
import { Avatar } from "../ui";
import ResumeButton from "../common/ResumeButton";

const SUBMISSION_LABEL = { ASSIGNED: "not submitted", SUBMITTED: "submitted, to review", REVIEWED: "reviewed" };

function actionsFor(status, offer, canAssign) {
  switch (status) {
    case "APPLIED":
    case "ELIGIBLE":
      return [
        { key: "shortlist", label: "Shortlist", primary: true },
        { key: "reject", label: "Reject", danger: true },
      ];
    case "SHORTLISTED":
    case "ASSESSMENT":
      return [
        { key: "interview", label: "Schedule interview", primary: true },
        ...(canAssign ? [{ key: "assignment", label: "Send assignment" }] : []),
        { key: "reject", label: "Reject", danger: true },
      ];
    case "INTERVIEW":
      return [
        { key: "select", label: "Select", primary: true },
        { key: "interview", label: "Add round" },
        { key: "reject", label: "Reject", danger: true },
      ];
    case "SELECTED":
      return [
        { key: "offer", label: "Make offer", primary: true },
        { key: "reject", label: "Reject", danger: true },
      ];
    case "ACCEPTED":
      return offer
        ? [
            { key: "joined", label: "Mark joined", primary: true },
            { key: "notJoined", label: "Did not join", danger: true },
          ]
        : [];
    default:
      return [];
  }
}

function PipelineCard({ application, interview, offer, showCompany, canAssign, busy, onAction, onDragStart, onDragEnd, dragging }) {
  const student = application.student;
  const name = student?.user?.fullName ?? "Student";
  const actions = actionsFor(application.status, offer, canAssign);
  const submissions = application.assignmentSubmissions ?? [];

  return (
    <article
      className={`pipeline-card ${dragging ? "is-dragging" : ""} ${busy ? "is-busy" : ""}`}
      draggable={!busy}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", application.id);
        onDragStart(application.id);
      }}
      onDragEnd={onDragEnd}
    >
      <div className="pipeline-card-top">
        <Avatar name={name} size="sm" />
        <div className="pipeline-card-identity">
          <strong>{name}</strong>
          <span>
            {student?.department ?? "—"} · CGPA {student?.cgpa || "—"}
          </span>
        </div>
        {application.matchScore != null && (
          <span className="pipeline-match num" title="Match score">
            {Math.round(application.matchScore)}%
          </span>
        )}
        {student?.resumeUrl && <ResumeButton studentId={student.id} name={name} compact />}
        <GripVertical className="pipeline-grip" aria-hidden="true" />
      </div>

      <div className="pipeline-card-job">
        {application.job?.title ?? "Role"}
        {showCompany && application.job?.company?.name ? ` · ${application.job.company.name}` : ""}
      </div>

      {interview && (
        <div className="pipeline-card-info">
          <CalendarClock aria-hidden="true" />
          {interview.round ?? "Interview"} · {formatDateTime(interview.scheduledAt)}
        </div>
      )}

      {submissions.map((s) => (
        <div key={s.id} className="pipeline-card-info">
          <ClipboardList aria-hidden="true" />
          {s.assignment.title} ·{" "}
          {s.status === "REVIEWED" ? `${s.score}/${s.assignment.maxScore}` : SUBMISSION_LABEL[s.status]}
        </div>
      ))}

      {offer && (
        <div className="pipeline-card-info">
          <Award aria-hidden="true" />
          {formatLpa(offer.ctc)} · {statusInfo("offer", offer.acceptanceStatus).label.toLowerCase()}
          {offer.joiningStatus !== "PENDING" ? ` · ${statusInfo("joining", offer.joiningStatus).label.toLowerCase()}` : ""}
        </div>
      )}

      <div className="pipeline-card-meta">
        <span>Applied {relativeTime(application.appliedAt)}</span>
        {application.autoShortlistedAt && (
          <span className="pipeline-tag pipeline-tag-auto" title={`Shortlisted automatically ${relativeTime(application.autoShortlistedAt)}`}>
            Auto-shortlisted
          </span>
        )}
        {application.status === "DECLINED" && <span className="pipeline-tag">Declined offer</span>}
        {application.status === "OFFERED" && <span className="pipeline-tag">Awaiting reply</span>}
      </div>

      {actions.length > 0 && (
        <div className="pipeline-card-actions">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              disabled={busy}
              className={`btn btn-sm ${a.primary ? "btn-secondary" : a.danger ? "btn-ghost btn-danger-ghost" : "btn-ghost"}`}
              onClick={() => onAction(a.key, application)}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

export default PipelineCard;
