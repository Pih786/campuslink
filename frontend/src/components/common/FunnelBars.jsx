import AnimatedNumber from "./AnimatedNumber";

export const FUNNEL_STAGES = [
  ["applied", "Applied"],
  ["shortlisted", "Shortlisted"],
  ["interview", "Interview"],
  ["selected", "Selected"],
  ["offer", "Offer"],
  ["accepted", "Accepted"],
  ["joined", "Joined"],
];

// stages: [{ key, label, count }] in funnel order. Bar width is relative to
// the first stage; conversion % is relative to the previous stage.
function FunnelBars({ stages }) {
  const top = Math.max(1, stages[0]?.count ?? 0);

  return (
    <ol className="funnel">
      {stages.map((stage, i) => {
        const prev = i === 0 ? null : stages[i - 1].count;
        const conversion = prev ? Math.round((stage.count / prev) * 100) : null;
        const width = stage.count === 0 ? 0 : Math.max(2, Math.round((stage.count / top) * 100));

        return (
          <li key={stage.key} className="funnel-row">
            <span className="funnel-label">{stage.label}</span>
            <span className="funnel-track">
              <span className="funnel-fill" style={{ width: `${width}%`, animationDelay: `${i * 50}ms` }} />
            </span>
            <span className="funnel-count num">
              <AnimatedNumber value={stage.count} />
            </span>
            <span className="funnel-conversion num">{conversion == null ? "" : `${conversion}%`}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default FunnelBars;
