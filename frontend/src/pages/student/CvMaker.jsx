import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, FileCheck2, FileText, Plus, RefreshCcw, Save, Sparkles, Trash2, X } from "lucide-react";
import { api, downloadFile } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { Alert, PageHeader, PageSkeleton, Spinner } from "../../components/ui";
import CvPreview from "../../components/cv/CvPreview";

const TEMPLATES = [
  { value: "classic", label: "Classic" },
  { value: "modern", label: "Modern" },
];

const EMPTY = {
  education: { institution: "", degree: "", field: "", start: "", end: "", score: "" },
  experience: { role: "", organization: "", location: "", start: "", end: "", bullets: [] },
  projects: { title: "", tech: [], url: "", bullets: [] },
  certifications: { name: "", issuer: "", year: "" },
  links: { label: "", url: "" },
};

const LIMITS = { education: 6, experience: 8, projects: 10, certifications: 12, links: 5 };

// Lines <-> array, keeping blank lines while typing (they're dropped on export).
const toLines = (list) => list.join("\n");
const fromLines = (text, max) => text.split("\n").slice(0, max);

function Field({ label, value, onChange, placeholder, wide, type = "text" }) {
  return (
    <label className={`field ${wide ? "span-2" : ""}`}>
      <span className="field-label">{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function ListSection({ title, hint, items, limit, onAdd, children }) {
  return (
    <fieldset className="form-section cv-section">
      <legend>{title}</legend>
      {hint && <p className="field-hint">{hint}</p>}
      {children}
      {items.length < limit && (
        <button type="button" className="btn btn-ghost btn-sm add-row-btn" onClick={onAdd}>
          <Plus />
          Add {title.toLowerCase().replace(/s$/, "")}
        </button>
      )}
    </fieldset>
  );
}

function ItemCard({ label, onRemove, children }) {
  return (
    <div className="cv-item">
      <div className="cv-item-head">
        <span>{label}</span>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onRemove} aria-label={`Remove ${label}`}>
          <Trash2 />
        </button>
      </div>
      <div className="form-grid">{children}</div>
    </div>
  );
}

function SkillsInput({ skills, onChange }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...skills];
    for (const p of parts) if (!next.some((s) => s.toLowerCase() === p.toLowerCase()) && next.length < 40) next.push(p.slice(0, 60));
    onChange(next);
    setDraft("");
  };
  return (
    <div className="stack">
      {skills.length > 0 && (
        <div className="chip-list">
          {skills.map((s) => (
            <span key={s} className="chip">
              <span>{s}</span>
              <button type="button" aria-label={`Remove ${s}`} onClick={() => onChange(skills.filter((x) => x !== s))}>
                <X />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="row">
        <input
          value={draft}
          placeholder="Type a skill and press Enter"
          aria-label="Add skill"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
        />
      </div>
    </div>
  );
}

function CvMaker() {
  const toast = useToast();
  const [cv, setCv] = useState(null);
  const [template, setTemplate] = useState("classic");
  const [meta, setMeta] = useState({ saved: false, hasResume: false, updatedAt: null });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/cv/me")
      .then((res) => {
        setCv(res.data.data);
        setTemplate(res.data.template);
        setMeta({ saved: res.data.saved, hasResume: res.data.hasResume, updatedAt: res.data.updatedAt });
      })
      .catch((err) => setError(err.message || "Could not load your CV"));
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const edit = useCallback((updater) => {
    setCv((prev) => updater(structuredClone(prev)));
    setDirty(true);
  }, []);

  const setHeader = (key) => (value) => edit((d) => ((d.header[key] = value), d));
  const setItem = (list, index, key) => (value) => edit((d) => ((d[list][index][key] = value), d));
  const addItem = (list) => edit((d) => (d[list].push(structuredClone(EMPTY[list])), d));
  const removeItem = (list, index) => edit((d) => (d[list].splice(index, 1), d));

  const save = async ({ quiet = false } = {}) => {
    setBusy("save");
    setError("");
    try {
      const res = await api.put("/cv/me", { template, data: cv });
      setMeta((m) => ({ ...m, saved: true, updatedAt: res.data.updatedAt }));
      setDirty(false);
      if (!quiet) toast.success("CV saved");
      return true;
    } catch (err) {
      const first = err.details?.details?.[0];
      setError(first ? `${first.path}: ${first.message}` : err.message || "Could not save your CV");
      return false;
    } finally {
      setBusy("");
    }
  };

  const fileBase = () => (cv.header.fullName || "cv").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") + "_CV";

  const download = async (format) => {
    if ((dirty || !meta.saved) && !(await save({ quiet: true }))) return;
    setBusy(format);
    try {
      await downloadFile(`/cv/me/export/${format}`, `${fileBase()}.${format}`);
    } catch (err) {
      toast.error(err.message || "Download failed");
    } finally {
      setBusy("");
    }
  };

  const useAsResume = async () => {
    if ((dirty || !meta.saved) && !(await save({ quiet: true }))) return;
    setBusy("resume");
    try {
      const res = await api.post("/cv/me/save-as-resume");
      const x = res.data.extracted;
      const added = [
        x.skillsAdded && `${x.skillsAdded} skill${x.skillsAdded > 1 ? "s" : ""}`,
        x.projectsAdded && `${x.projectsAdded} project${x.projectsAdded > 1 ? "s" : ""}`,
        x.certificationsAdded && `${x.certificationsAdded} certificate${x.certificationsAdded > 1 ? "s" : ""}`,
      ].filter(Boolean);
      toast.success(added.length ? `Saved as your resume. Added ${added.join(", ")} to your profile.` : "Saved as your resume");
      setMeta((m) => ({ ...m, hasResume: true }));
    } catch (err) {
      toast.error(err.message || "Could not save as resume");
    } finally {
      setBusy("");
    }
  };

  const suggestSummary = async () => {
    setBusy("summary");
    try {
      const res = await api.post("/cv/me/suggest-summary", { data: cv });
      edit((d) => ((d.summary = res.data.summary), d));
      toast.info(res.data.source === "llm" ? "Draft written. Edit it to sound like you." : "Drafted from your details. Edit it to sound like you.");
    } catch (err) {
      toast.error(err.message || "Could not draft a summary");
    } finally {
      setBusy("");
    }
  };

  const resetFromProfile = async () => {
    if (!window.confirm("Replace everything in the editor with a fresh draft from your profile?")) return;
    setBusy("reset");
    try {
      const res = await api.get("/cv/me/prefill");
      setCv(res.data);
      setDirty(true);
    } catch (err) {
      toast.error(err.message || "Could not load your profile");
    } finally {
      setBusy("");
    }
  };

  if (!cv) return error ? <div className="page"><Alert tone="error">{error}</Alert></div> : <PageSkeleton cards={2} />;

  return (
    <div className="page cv-page">
      <PageHeader
        title="CV maker"
        subtitle="Build a clean, ATS-friendly CV from your profile. Download it as PDF or Word, or use it as your resume on CampusLink."
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => download("docx")} disabled={Boolean(busy)}>
              {busy === "docx" ? <Spinner /> : <FileText />}
              Word
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => download("pdf")} disabled={Boolean(busy)}>
              {busy === "pdf" ? <Spinner /> : <Download />}
              PDF
            </button>
            <button type="button" className="btn btn-primary" onClick={useAsResume} disabled={Boolean(busy)}>
              {busy === "resume" ? <Spinner /> : <FileCheck2 />}
              Use as my resume
            </button>
          </>
        }
      />

      {!meta.saved && (
        <Alert tone="info" title="We've started it for you">
          This draft comes from your profile: education, skills, projects, certifications and verified assessment
          scores. Add a summary and any internships, then save.
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="cv-layout">
        <form
          className="cv-editor"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="cv-toolbar">
            <div className="segmented" role="group" aria-label="Template">
              {TEMPLATES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={template === t.value}
                  onClick={() => {
                    setTemplate(t.value);
                    setDirty(true);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <span className="cv-status">{dirty ? "Unsaved changes" : meta.saved ? "All changes saved" : "Not saved yet"}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetFromProfile} disabled={Boolean(busy)}>
              <RefreshCcw />
              Refill from profile
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={Boolean(busy) || (!dirty && meta.saved)}>
              {busy === "save" ? <Spinner /> : <Save />}
              Save
            </button>
          </div>

          <fieldset className="form-section cv-section">
            <legend>Contact</legend>
            <div className="form-grid">
              <Field label="Full name" value={cv.header.fullName} onChange={setHeader("fullName")} />
              <Field label="Headline" value={cv.header.headline} onChange={setHeader("headline")} placeholder="e.g. Final-year CSE student" />
              <Field label="Email" type="email" value={cv.header.email} onChange={setHeader("email")} />
              <Field label="Phone" value={cv.header.phone} onChange={setHeader("phone")} placeholder="+91 …" />
              <Field label="Location" value={cv.header.location} onChange={setHeader("location")} wide />
            </div>
            {cv.header.links.map((l, i) => (
              <div key={i} className="cv-link-row">
                <input
                  aria-label={`Link ${i + 1} label`}
                  placeholder="Label, e.g. GitHub"
                  value={l.label}
                  onChange={(e) => edit((d) => ((d.header.links[i].label = e.target.value), d))}
                />
                <input
                  aria-label={`Link ${i + 1} URL`}
                  placeholder="https://github.com/you"
                  value={l.url}
                  onChange={(e) => edit((d) => ((d.header.links[i].url = e.target.value), d))}
                />
                <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Remove link ${i + 1}`} onClick={() => edit((d) => (d.header.links.splice(i, 1), d))}>
                  <Trash2 />
                </button>
              </div>
            ))}
            {cv.header.links.length < LIMITS.links && (
              <button type="button" className="btn btn-ghost btn-sm add-row-btn" onClick={() => edit((d) => (d.header.links.push({ label: "", url: "" }), d))}>
                <Plus />
                Add link (GitHub, LinkedIn, portfolio)
              </button>
            )}
          </fieldset>

          <fieldset className="form-section cv-section">
            <legend>Summary</legend>
            <textarea
              rows={4}
              maxLength={1200}
              value={cv.summary}
              aria-label="Summary"
              placeholder="Two or three lines on what you're good at and what you're looking for."
              onChange={(e) => edit((d) => ((d.summary = e.target.value), d))}
            />
            <button type="button" className="btn btn-secondary btn-sm cv-ai-btn" onClick={suggestSummary} disabled={Boolean(busy)}>
              {busy === "summary" ? <Spinner /> : <Sparkles />}
              {cv.summary.trim() ? "Rewrite with AI" : "Draft with AI"}
            </button>
          </fieldset>

          <ListSection title="Education" items={cv.education} limit={LIMITS.education} onAdd={() => addItem("education")}>
            {cv.education.map((e, i) => (
              <ItemCard key={i} label={e.institution || `Education ${i + 1}`} onRemove={() => removeItem("education", i)}>
                <Field label="Institution" value={e.institution} onChange={setItem("education", i, "institution")} wide />
                <Field label="Degree" value={e.degree} onChange={setItem("education", i, "degree")} placeholder="e.g. B.Tech" />
                <Field label="Field" value={e.field} onChange={setItem("education", i, "field")} placeholder="e.g. Computer Science" />
                <Field label="Start" value={e.start} onChange={setItem("education", i, "start")} placeholder="2022" />
                <Field label="End" value={e.end} onChange={setItem("education", i, "end")} placeholder="2026" />
                <Field label="Score" value={e.score} onChange={setItem("education", i, "score")} placeholder="CGPA 8.4/10 or 92%" wide />
              </ItemCard>
            ))}
          </ListSection>

          <fieldset className="form-section cv-section">
            <legend>Skills</legend>
            <SkillsInput skills={cv.skills} onChange={(skills) => edit((d) => ((d.skills = skills), d))} />
          </fieldset>

          <ListSection
            title="Experience"
            hint="Internships, part-time work, research or club leadership. Start each line with a verb and a result."
            items={cv.experience}
            limit={LIMITS.experience}
            onAdd={() => addItem("experience")}
          >
            {cv.experience.map((e, i) => (
              <ItemCard key={i} label={e.role || `Experience ${i + 1}`} onRemove={() => removeItem("experience", i)}>
                <Field label="Role" value={e.role} onChange={setItem("experience", i, "role")} placeholder="Software Engineering Intern" />
                <Field label="Organisation" value={e.organization} onChange={setItem("experience", i, "organization")} />
                <Field label="Start" value={e.start} onChange={setItem("experience", i, "start")} placeholder="May 2025" />
                <Field label="End" value={e.end} onChange={setItem("experience", i, "end")} placeholder="Jul 2025" />
                <Field label="Location" value={e.location} onChange={setItem("experience", i, "location")} wide />
                <label className="field span-2">
                  <span className="field-label">What you did (one per line)</span>
                  <textarea rows={3} value={toLines(e.bullets)} onChange={(ev) => setItem("experience", i, "bullets")(fromLines(ev.target.value, 8))} />
                </label>
              </ItemCard>
            ))}
          </ListSection>

          <ListSection title="Projects" items={cv.projects} limit={LIMITS.projects} onAdd={() => addItem("projects")}>
            {cv.projects.map((p, i) => (
              <ItemCard key={i} label={p.title || `Project ${i + 1}`} onRemove={() => removeItem("projects", i)}>
                <Field label="Title" value={p.title} onChange={setItem("projects", i, "title")} wide />
                <Field
                  label="Tech used (comma separated)"
                  value={p.tech.join(", ")}
                  onChange={(v) => setItem("projects", i, "tech")(v.split(",").map((t) => t.trimStart()).slice(0, 15))}
                />
                <Field label="Link" value={p.url} onChange={setItem("projects", i, "url")} placeholder="https://…" />
                <label className="field span-2">
                  <span className="field-label">Highlights (one per line)</span>
                  <textarea rows={3} value={toLines(p.bullets)} onChange={(ev) => setItem("projects", i, "bullets")(fromLines(ev.target.value, 8))} />
                </label>
              </ItemCard>
            ))}
          </ListSection>

          <ListSection title="Certifications" items={cv.certifications} limit={LIMITS.certifications} onAdd={() => addItem("certifications")}>
            {cv.certifications.map((c, i) => (
              <ItemCard key={i} label={c.name || `Certification ${i + 1}`} onRemove={() => removeItem("certifications", i)}>
                <Field label="Name" value={c.name} onChange={setItem("certifications", i, "name")} wide />
                <Field label="Issuer" value={c.issuer} onChange={setItem("certifications", i, "issuer")} />
                <Field label="Year" value={c.year} onChange={setItem("certifications", i, "year")} />
              </ItemCard>
            ))}
          </ListSection>

          <fieldset className="form-section cv-section">
            <legend>Achievements</legend>
            <textarea
              rows={3}
              aria-label="Achievements, one per line"
              placeholder="Hackathon wins, ranks, scholarships. One per line."
              value={toLines(cv.achievements)}
              onChange={(e) => edit((d) => ((d.achievements = fromLines(e.target.value, 10)), d))}
            />
          </fieldset>
        </form>

        <aside className="cv-preview-pane" aria-label="Live preview">
          <div className="cv-preview-sticky">
            <div className="cv-preview-label">
              Live preview
              {meta.hasResume && (
                <Link to="/student/profile" className="label-link">
                  Current resume on profile
                </Link>
              )}
            </div>
            <div className="cv-paper">
              <CvPreview
                data={{
                  ...cv,
                  projects: cv.projects.map((p) => ({ ...p, tech: p.tech.map((t) => t.trim()) })),
                }}
                template={template}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default CvMaker;
