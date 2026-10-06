import { useState } from "react";
import { BookMarked, BookOpen, CircleCheck, Clock, ExternalLink, FileCode2, GraduationCap, PlayCircle, Trash2 } from "lucide-react";
import { api } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { Badge } from "../ui";

export const RESOURCE_TYPES = {
  COURSE: { label: "Course", icon: GraduationCap },
  DOCUMENTATION: { label: "Docs", icon: BookOpen },
  ARTICLE: { label: "Article", icon: BookMarked },
  PRACTICE: { label: "Practice", icon: FileCode2 },
  VIDEO: { label: "Video", icon: PlayCircle },
};

const STATUS_STEPS = [
  { value: "SAVED", label: "Save" },
  { value: "IN_PROGRESS", label: "Started" },
  { value: "COMPLETED", label: "Done" },
];

function duration(minutes) {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours} h`;
}

// One library entry. Students get a save / started / done control;
// staff get a remove button for items their college added.
function ResourceItem({ resource, showSkill = false, trackable = false, onStatusChange, onDelete }) {
  const toast = useToast();
  const [status, setStatus] = useState(resource.status ?? null);
  const [busy, setBusy] = useState(false);
  const type = RESOURCE_TYPES[resource.type] ?? RESOURCE_TYPES.ARTICLE;
  const Icon = type.icon;

  const update = async (next) => {
    const value = status === next ? null : next;
    setBusy(true);
    try {
      await api.put(`/learning/resources/${resource.id}/progress`, { status: value });
      setStatus(value);
      onStatusChange?.(resource.id, value);
      if (value === "COMPLETED") toast.success("Marked as done");
    } catch (err) {
      toast.error(err.message || "Could not update progress");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`resource ${status === "COMPLETED" ? "is-done" : ""}`}>
      <span className="resource-icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="resource-body">
        <a href={resource.url} target="_blank" rel="noreferrer" className="resource-title">
          {resource.title}
          <ExternalLink aria-hidden="true" />
        </a>
        <div className="resource-meta">
          <span>{type.label}</span>
          {resource.provider && <span>{resource.provider}</span>}
          {resource.level && <span>{resource.level}</span>}
          {duration(resource.durationMinutes) && (
            <span>
              <Clock aria-hidden="true" />
              {duration(resource.durationMinutes)}
            </span>
          )}
          {showSkill && resource.skill && <Badge plain>{resource.skill.name}</Badge>}
          {resource.collegeId && <Badge tone="info">Your college</Badge>}
        </div>
        {resource.description && <p className="resource-desc">{resource.description}</p>}
      </div>
      {trackable && (
        <div className="resource-progress" role="group" aria-label={`Progress for ${resource.title}`}>
          {STATUS_STEPS.map((step) => (
            <button
              key={step.value}
              type="button"
              aria-pressed={status === step.value}
              disabled={busy}
              onClick={() => update(step.value)}
            >
              {step.value === "COMPLETED" && status === "COMPLETED" && <CircleCheck aria-hidden="true" />}
              {step.label}
            </button>
          ))}
        </div>
      )}
      {onDelete && resource.canDelete && (
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          aria-label={`Remove ${resource.title}`}
          onClick={() => onDelete(resource)}
        >
          <Trash2 />
        </button>
      )}
    </li>
  );
}

export default ResourceItem;
