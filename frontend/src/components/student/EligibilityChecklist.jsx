import { CircleCheck, CircleMinus, CircleX } from "lucide-react";

// checks: [{ type, mandatory, pass, label, detail }]
function EligibilityChecklist({ checks }) {
  const visible = checks.filter((c) => c.type !== "CERTIFICATION");
  const hard = visible.filter((c) => c.mandatory);
  const preferred = visible.filter((c) => !c.mandatory);

  const renderItem = (c, i) => {
    let Icon = CircleCheck;
    let tone = "is-pass";
    if (!c.pass) {
      Icon = c.mandatory ? CircleX : CircleMinus;
      tone = c.mandatory ? "is-fail" : "is-soft";
    }
    return (
      <li key={`${c.type}-${c.label}-${i}`} className={tone}>
        <Icon aria-hidden="true" />
        <span>
          <span className="sr-only">{c.pass ? "Met: " : c.mandatory ? "Not met: " : "Optional, not met: "}</span>
          {c.detail}
        </span>
      </li>
    );
  };

  return (
    <div className="criteria">
      {hard.length > 0 && (
        <div>
          <span className="criteria-label">Requirements</span>
          <ul className="criteria-list">{hard.map(renderItem)}</ul>
        </div>
      )}
      {preferred.length > 0 && (
        <div>
          <span className="criteria-label">Preferred</span>
          <ul className="criteria-list">{preferred.map(renderItem)}</ul>
        </div>
      )}
    </div>
  );
}

export default EligibilityChecklist;
