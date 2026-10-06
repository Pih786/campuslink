import { useEffect, useState } from "react";
import { ExternalLink, PlayCircle, Search } from "lucide-react";
import { api } from "../../services/api";
import { Spinner } from "../ui";

// YouTube suggestions for one skill. With an API key configured the backend
// returns real videos; otherwise it returns ready-made YouTube searches.
function SkillVideos({ skill, mode = "learn" }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    api
      .get(`/learning/videos?skill=${encodeURIComponent(skill)}&mode=${mode}`)
      .then((res) => !cancelled && setData(res.data))
      .catch((err) => !cancelled && setError(err.message || "Could not load videos"));
    return () => {
      cancelled = true;
    };
  }, [skill, mode]);

  if (error) return <p className="field-hint">{error}</p>;
  if (!data) {
    return (
      <div className="videos-loading">
        <Spinner /> Finding videos
      </div>
    );
  }

  return (
    <div className="skill-videos">
      {data.videos.length > 0 && (
        <ul className="video-grid">
          {data.videos.map((v) => (
            <li key={v.videoId}>
              <a href={v.url} target="_blank" rel="noreferrer" className="video-card">
                <span className="video-thumb">
                  {v.thumbnail ? <img src={v.thumbnail} alt="" loading="lazy" /> : null}
                  <PlayCircle aria-hidden="true" />
                </span>
                <span className="video-title">{v.title}</span>
                <span className="video-channel">{v.channel}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="video-searches">
        <span className="field-hint">{data.videos.length ? "More on YouTube:" : "Search YouTube:"}</span>
        {data.searches.map((s) => (
          <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
            <Search aria-hidden="true" />
            {s.label}
            <ExternalLink aria-hidden="true" className="icon-trailing" />
          </a>
        ))}
      </div>
    </div>
  );
}

export default SkillVideos;
