import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { api } from "../../services/api";
import { Spinner } from "../ui";
import ResourceItem from "./ResourceItem";
import SkillVideos from "./SkillVideos";

// Everything a student needs to start on one skill: library material with
// progress tracking, video suggestions, and a way into the AI tutor.
// Pass `resources` when the caller already has them (the learning plan).
function SkillLearnPanel({ skill, mode = "learn", resources: given, onStatusChange }) {
  const [resources, setResources] = useState(given ?? null);

  useEffect(() => {
    if (given) {
      setResources(given);
      return undefined;
    }
    let cancelled = false;
    setResources(null);
    api
      .get(`/learning/resources?skill=${encodeURIComponent(skill)}`)
      .then((res) => !cancelled && setResources(res.data ?? []))
      .catch(() => !cancelled && setResources([]));
    return () => {
      cancelled = true;
    };
  }, [skill, given]);

  return (
    <div className="learn-panel">
      <section>
        <h3 className="learn-panel-title">Study material</h3>
        {resources === null ? (
          <div className="videos-loading">
            <Spinner /> Loading
          </div>
        ) : resources.length === 0 ? (
          <p className="field-hint">
            No library material for {skill} yet. The videos below and the AI tutor are a good start.
          </p>
        ) : (
          <ul className="resource-list">
            {resources.map((r) => (
              <ResourceItem key={r.id} resource={r} trackable onStatusChange={onStatusChange} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="learn-panel-title">{mode === "improve" ? "Level up with videos" : "Videos to get started"}</h3>
        <SkillVideos skill={skill} mode={mode} />
      </section>

      <Link className="btn btn-secondary btn-sm learn-panel-tutor" to={`/student/tutor?skill=${encodeURIComponent(skill)}`}>
        <Sparkles aria-hidden="true" />
        Ask the AI tutor about {skill}
      </Link>
    </div>
  );
}

export default SkillLearnPanel;
