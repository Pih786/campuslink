import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ChevronDown, CircleCheck, GraduationCap, Library, Search, Sparkles, Target } from "lucide-react";
import { api } from "../../services/api";
import { Alert, Badge, EmptyState, PageHeader, PageSkeleton, Spinner, StatCard } from "../../components/ui";
import ResourceItem, { RESOURCE_TYPES } from "../../components/learning/ResourceItem";
import SkillLearnPanel from "../../components/learning/SkillLearnPanel";

const TABS = [
  { key: "plan", label: "Improve my match" },
  { key: "mine", label: "My list" },
  { key: "library", label: "Library" },
];

const STATUS_GROUPS = [
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "SAVED", label: "Saved for later" },
  { key: "COMPLETED", label: "Completed" },
];

function PlanSkill({ skill, open, onToggle }) {
  const done = skill.completed;
  const total = skill.resources.length;
  return (
    <li className={`plan-skill ${open ? "is-open" : ""}`}>
      <button type="button" className="plan-skill-head" onClick={onToggle} aria-expanded={open}>
        <div className="plan-skill-name">
          <strong>{skill.name}</strong>
          {skill.status === "missing" ? (
            <Badge tone="warning">Not on your profile</Badge>
          ) : (
            <Badge tone="info">
              Level {skill.have} → {skill.need}
            </Badge>
          )}
        </div>
        <span className="plan-skill-roles">
          Needed for {skill.roles.length === 1 ? skill.roles[0] : `${skill.roles.length} roles`}
        </span>
        <span className="plan-skill-progress">
          {total > 0 ? `${done}/${total} done` : "Videos + tutor"}
        </span>
        <ChevronDown className="plan-skill-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="plan-skill-body">
          <SkillLearnPanel
            skill={skill.name}
            mode={skill.status === "missing" ? "learn" : "improve"}
            resources={skill.resources}
          />
        </div>
      )}
    </li>
  );
}

function LibraryTab() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [items, setItems] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (type) params.set("type", type);
      api
        .get(`/learning/resources?${params}`)
        .then((res) => !cancelled && setItems(res.data ?? []))
        .catch(() => !cancelled && setItems([]));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, type]);

  return (
    <div className="stack">
      <div className="toolbar">
        <label className="search-input">
          <Search aria-hidden="true" />
          <input
            type="search"
            placeholder="Search by skill, title or provider"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search the library"
          />
        </label>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          {Object.entries(RESOURCE_TYPES).map(([value, t]) => (
            <option key={value} value={value}>
              {t.label}
            </option>
          ))}
        </select>
        {items && <span className="toolbar-count">{items.length} shown</span>}
      </div>
      <div className="card">
        {items === null ? (
          <div className="card-loading">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <EmptyState compact icon={Library} title="Nothing matches">
            Try a different skill name.
          </EmptyState>
        ) : (
          <ul className="resource-list">
            {items.map((r) => (
              <ResourceItem key={r.id} resource={r} showSkill trackable />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function LearningPage() {
  const [tab, setTab] = useState("plan");
  const [plan, setPlan] = useState(null);
  const [mine, setMine] = useState(null);
  const [openSkill, setOpenSkill] = useState(null);
  const [error, setError] = useState("");

  const loadPlan = useCallback(async () => {
    try {
      const res = await api.get("/learning/plan");
      setPlan(res.data);
      setOpenSkill((current) => current ?? res.data.skills[0]?.name ?? null);
    } catch (err) {
      setError(err.message || "Could not build your plan");
    }
  }, []);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  useEffect(() => {
    if (tab !== "mine") return;
    setMine(null);
    api
      .get("/learning/me")
      .then((res) => setMine(res.data))
      .catch((err) => setError(err.message || "Could not load your list"));
  }, [tab]);

  if (!plan && !error) return <PageSkeleton stats={3} cards={2} />;

  return (
    <div className="page">
      <PageHeader
        title="Learning"
        subtitle="What to learn next, based on the skills the roles open to you ask for."
        actions={
          <Link className="btn btn-secondary" to="/student/tutor">
            <Sparkles aria-hidden="true" />
            AI tutor
          </Link>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      {plan && (
        <div className="stat-grid stat-grid-3">
          <StatCard icon={Target} label="Skills to work on" value={plan.skills.length} meta={`From ${plan.rolesConsidered} open roles`} />
          <StatCard icon={BookOpen} label="In progress" value={plan.counts.IN_PROGRESS} meta={`${plan.counts.SAVED} saved for later`} />
          <StatCard icon={GraduationCap} label="Completed" value={plan.counts.COMPLETED} tone={plan.counts.COMPLETED ? "success" : undefined} />
        </div>
      )}

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" className="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "plan" && plan && (
        plan.skills.length === 0 ? (
          <EmptyState icon={CircleCheck} title="You cover every skill the open roles ask for">
            Browse the library to go deeper, or practise in the coding and SQL labs.
          </EmptyState>
        ) : (
          <>
            <p className="field-hint">
              Ranked by how many open roles need each skill. Finishing material doesn't change your match on its
              own: add the skill to your profile or prove it in the labs and assessments.
            </p>
            <ul className="plan-list">
              {plan.skills.map((s) => (
                <PlanSkill
                  key={s.name}
                  skill={s}
                  open={openSkill === s.name}
                  onToggle={() => setOpenSkill((cur) => (cur === s.name ? null : s.name))}
                />
              ))}
            </ul>
          </>
        )
      )}

      {tab === "mine" &&
        (mine === null ? (
          <div className="skeleton skeleton-card" />
        ) : mine.items.length === 0 ? (
          <EmptyState icon={BookOpen} title="Your list is empty">
            Save material from your plan or the library to find it here.
          </EmptyState>
        ) : (
          STATUS_GROUPS.filter((g) => mine.items.some((i) => i.status === g.key)).map((g) => (
            <section key={g.key} className="stack">
              <h2 className="section-title">
                {g.label} <span className="count">{mine.counts[g.key]}</span>
              </h2>
              <div className="card">
                <ul className="resource-list">
                  {mine.items
                    .filter((i) => i.status === g.key)
                    .map((r) => (
                      <ResourceItem key={r.id} resource={r} showSkill trackable onStatusChange={() => loadPlan()} />
                    ))}
                </ul>
              </div>
            </section>
          ))
        ))}

      {tab === "library" && <LibraryTab />}
    </div>
  );
}

export default LearningPage;
