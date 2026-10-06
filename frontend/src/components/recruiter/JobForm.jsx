import { useEffect, useRef, useState } from "react";
import { Check, Globe, Landmark, Plus, Trash2, X } from "lucide-react";
import { api } from "../../services/api";
import { BRANCHES } from "../../lib/branches";
import { Alert, Spinner } from "../ui";
import CollegePicker from "../common/CollegePicker";
import JdAutofill from "./JdAutofill";

const AI_FLASH_MS = 2400;

const EMPLOYMENT_TYPES = [
  { value: "FULL_TIME", label: "Full-time" },
  { value: "INTERNSHIP", label: "Internship" },
  { value: "CONTRACT", label: "Contract" },
];

const LAKH = 100000;

function emptySkillRow() {
  return { skillName: "", mandatory: true, minimumProficiency: 3, weight: 1 };
}

function JobForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    location: "",
    employmentType: "FULL_TIME",
    salaryMinLpa: "",
    salaryMaxLpa: "",
    applicationDeadline: "",
    minimumCgpa: "",
    maxBacklogs: "",
    minimumMockScore: "",
  });
  const [mockMandatory, setMockMandatory] = useState(true);
  const [autoShortlist, setAutoShortlist] = useState(false);
  const [autoShortlistMinScore, setAutoShortlistMinScore] = useState(70);
  const [branches, setBranches] = useState([]);
  const [visibility, setVisibility] = useState("GLOBAL");
  const [targetColleges, setTargetColleges] = useState([]);
  const [skillRows, setSkillRows] = useState([emptySkillRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [aiFilled, setAiFilled] = useState(() => new Set());
  const flashTimer = useRef(null);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const flash = (field) => (aiFilled.has(field) ? "ai-filled" : "");

  const applyJdAnalysis = (result, jdText) => {
    const filled = new Set();
    const next = { ...form };
    if (result.role) {
      next.title = result.role;
      filled.add("title");
    }
    if (result.location) {
      next.location = result.location;
      filled.add("location");
    }
    if (result.minimumCgpa != null) {
      next.minimumCgpa = String(result.minimumCgpa);
      filled.add("minimumCgpa");
    }
    if (!form.description.trim()) {
      next.description = jdText.trim();
      filled.add("description");
    }
    setForm(next);

    if (result.branches?.length) {
      setBranches(result.branches);
      filled.add("branches");
    }

    const rows = [
      ...result.mandatorySkills.map((skillName) => ({ ...emptySkillRow(), skillName, mandatory: true })),
      ...result.optionalSkills.map((skillName) => ({ ...emptySkillRow(), skillName, mandatory: false })),
    ];
    if (rows.length) {
      setSkillRows(rows);
      filled.add("skills");
    }

    setAiFilled(filled);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setAiFilled(new Set()), AI_FLASH_MS);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const toggleBranch = (code) =>
    setBranches((prev) => (prev.includes(code) ? prev.filter((b) => b !== code) : [...prev, code]));

  const updateSkillRow = (index, field, value) =>
    setSkillRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  const addSkillRow = () => setSkillRows((prev) => [...prev, emptySkillRow()]);
  const removeSkillRow = (index) => setSkillRows((prev) => prev.filter((_, i) => i !== index));

  const addTargetCollege = (college) => {
    if (!college) return;
    setTargetColleges((prev) => (prev.some((c) => c.id === college.id) ? prev : [...prev, college]));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (visibility === "SELECTED_COLLEGES" && targetColleges.length === 0) {
      setError("Add at least one college, or open the job to all colleges.");
      return;
    }
    setSubmitting(true);
    setError("");

    const requirements = skillRows
      .filter((row) => row.skillName.trim())
      .map((row) => ({
        requirementType: "SKILL",
        skillName: row.skillName.trim(),
        mandatory: row.mandatory,
        weight: Number(row.weight) || 1,
        minimumProficiency: Number(row.minimumProficiency) || 1,
      }));

    if (form.minimumCgpa) {
      requirements.push({ requirementType: "CGPA", value: Number(form.minimumCgpa), mandatory: true });
    }
    if (branches.length) {
      requirements.push({ requirementType: "BRANCH", value: branches, mandatory: true });
    }
    if (form.maxBacklogs !== "") {
      requirements.push({ requirementType: "BACKLOG", value: Number(form.maxBacklogs), mandatory: true });
    }
    if (form.minimumMockScore !== "") {
      requirements.push({ requirementType: "MOCK_INTERVIEW", value: Number(form.minimumMockScore), mandatory: mockMandatory });
    }

    try {
      await api.post("/jobs", {
        title: form.title,
        description: form.description,
        location: form.location,
        employmentType: form.employmentType,
        salaryMin: form.salaryMinLpa ? Math.round(Number(form.salaryMinLpa) * LAKH) : undefined,
        salaryMax: form.salaryMaxLpa ? Math.round(Number(form.salaryMaxLpa) * LAKH) : undefined,
        experienceRequired: 0,
        applicationDeadline: form.applicationDeadline
          ? new Date(`${form.applicationDeadline}T00:00:00`).toISOString()
          : undefined,
        status: "PUBLISHED",
        visibility,
        collegeIds: visibility === "SELECTED_COLLEGES" ? targetColleges.map((c) => c.id) : [],
        requirements,
        autoShortlist,
        autoShortlistMinScore: Number(autoShortlistMinScore) || 70,
      });
      onCreated?.();
    } catch (err) {
      setError(err.message || "Could not publish the job");
    } finally {
      setSubmitting(false);
    }
  };

  const extraBranches = branches.filter((code) => !BRANCHES.some((b) => b.code === code));

  return (
    <section className="card job-form">
      <div className="card-header">
        <div>
          <h2 className="card-title">Post a job</h2>
          <p className="card-subtitle">
            Choose which colleges see the role. Only students who meet every requirement can apply.
          </p>
        </div>
      </div>

      <JdAutofill onApply={applyJdAnalysis} />

      <form className="job-form-body" onSubmit={handleSubmit}>
        <fieldset className="form-section">
          <legend>Role</legend>
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="job-title">Job title</label>
              <input id="job-title" className={flash("title")} name="title" value={form.title} onChange={handleChange} required placeholder="e.g. Graduate Software Engineer" />
            </div>
            <div className="field">
              <label htmlFor="job-location">Location</label>
              <input id="job-location" className={flash("location")} name="location" value={form.location} onChange={handleChange} placeholder="e.g. Bengaluru" />
            </div>
            <div className="field">
              <label htmlFor="job-type">Employment type</label>
              <select id="job-type" name="employmentType" value={form.employmentType} onChange={handleChange}>
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="job-salary-min">Salary from (LPA)</label>
              <input id="job-salary-min" type="number" min="0" step="0.1" name="salaryMinLpa" value={form.salaryMinLpa} onChange={handleChange} placeholder="e.g. 6" />
            </div>
            <div className="field">
              <label htmlFor="job-salary-max">Salary to (LPA)</label>
              <input id="job-salary-max" type="number" min="0" step="0.1" name="salaryMaxLpa" value={form.salaryMaxLpa} onChange={handleChange} placeholder="e.g. 9" />
            </div>
            <div className="field">
              <label htmlFor="job-deadline">Applications close</label>
              <input id="job-deadline" type="date" name="applicationDeadline" value={form.applicationDeadline} onChange={handleChange} />
            </div>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>Colleges</legend>
          <div className="segmented" role="group" aria-label="Which colleges can see this job">
            <button type="button" aria-pressed={visibility === "GLOBAL"} onClick={() => setVisibility("GLOBAL")}>
              <Globe aria-hidden="true" />
              All colleges
            </button>
            <button
              type="button"
              aria-pressed={visibility === "SELECTED_COLLEGES"}
              onClick={() => setVisibility("SELECTED_COLLEGES")}
            >
              <Landmark aria-hidden="true" />
              Selected colleges
            </button>
          </div>
          {visibility === "GLOBAL" ? (
            <span className="field-hint">Eligible students at every college on CampusLink can see and apply.</span>
          ) : (
            <div className="field">
              <label htmlFor="job-colleges">Add colleges</label>
              <CollegePicker id="job-colleges" value={null} onChange={addTargetCollege} />
              {targetColleges.length > 0 ? (
                <div className="chip-list" aria-label="Selected colleges">
                  {targetColleges.map((c) => (
                    <span key={c.id} className="chip">
                      <span>{c.name}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${c.name}`}
                        onClick={() => setTargetColleges((prev) => prev.filter((x) => x.id !== c.id))}
                      >
                        <X />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="field-hint">Only students of these colleges will see the job.</span>
              )}
            </div>
          )}
        </fieldset>

        <fieldset className="form-section">
          <legend>Eligibility</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="job-cgpa">Minimum CGPA</label>
              <input id="job-cgpa" className={flash("minimumCgpa")} type="number" min="0" max="10" step="0.1" name="minimumCgpa" value={form.minimumCgpa} onChange={handleChange} placeholder="No minimum" />
            </div>
            <div className="field">
              <label htmlFor="job-backlogs">Maximum active backlogs</label>
              <input id="job-backlogs" type="number" min="0" name="maxBacklogs" value={form.maxBacklogs} onChange={handleChange} placeholder="No limit" />
            </div>
            <div className="field span-2">
              <span className="field-label">Eligible branches</span>
              <div className={`choice-group ${flash("branches")}`} role="group" aria-label="Eligible branches">
                {[...BRANCHES.map((b) => b.code), ...extraBranches].map((code) => {
                  const on = branches.includes(code);
                  return (
                    <button key={code} type="button" className="choice" aria-pressed={on} onClick={() => toggleBranch(code)}>
                      {on && <Check aria-hidden="true" />}
                      {code}
                    </button>
                  );
                })}
              </div>
              <span className="field-hint">Leave all unselected to accept every branch.</span>
            </div>
            <div className="field">
              <label htmlFor="job-mock">Minimum mock-interview score</label>
              <input id="job-mock" type="number" min="0" max="10" step="0.5" name="minimumMockScore" value={form.minimumMockScore} onChange={handleChange} placeholder="No benchmark" />
              <span className="field-hint">Out of 10, from the latest mock interview the placement office recorded.</span>
            </div>
            <div className="field">
              <span className="field-label">Benchmark type</span>
              <div className="segmented" role="group" aria-label="Is the mock-interview benchmark required?">
                <button type="button" aria-pressed={mockMandatory} onClick={() => setMockMandatory(true)} disabled={form.minimumMockScore === ""}>
                  Required
                </button>
                <button type="button" aria-pressed={!mockMandatory} onClick={() => setMockMandatory(false)} disabled={form.minimumMockScore === ""}>
                  Preferred
                </button>
              </div>
            </div>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>Shortlisting</legend>
          <label className="check">
            <input type="checkbox" checked={autoShortlist} onChange={(e) => setAutoShortlist(e.target.checked)} />
            <span>Shortlist eligible applicants automatically</span>
          </label>
          {autoShortlist && (
            <div className="field auto-shortlist-threshold">
              <label htmlFor="job-auto-min">When their match score is at least</label>
              <input id="job-auto-min" type="number" min="0" max="100" value={autoShortlistMinScore} onChange={(e) => setAutoShortlistMinScore(e.target.value)} />
            </div>
          )}
          <span className="field-hint">
            {autoShortlist
              ? `Eligible applicants scoring ${autoShortlistMinScore || 70} or more move to Shortlisted and are told why. Everyone else stays with you to review.`
              : "Off: you move every applicant yourself."}
          </span>
        </fieldset>

        <fieldset className="form-section">
          <legend>Skills</legend>
          <div className={`skill-rows ${flash("skills")}`}>
            <div className="skill-row skill-row-head" aria-hidden="true">
              <span>Skill</span>
              <span>Minimum level</span>
              <span>Type</span>
              <span />
            </div>
            {skillRows.map((row, index) => (
              <div className="skill-row" key={index}>
                <input
                  aria-label={`Skill ${index + 1}`}
                  placeholder="e.g. React"
                  value={row.skillName}
                  onChange={(e) => updateSkillRow(index, "skillName", e.target.value)}
                />
                <select
                  aria-label={`Minimum level for skill ${index + 1}`}
                  value={row.minimumProficiency}
                  onChange={(e) => updateSkillRow(index, "minimumProficiency", e.target.value)}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      Level {n}
                    </option>
                  ))}
                </select>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={row.mandatory}
                    onChange={(e) => updateSkillRow(index, "mandatory", e.target.checked)}
                  />
                  <span className="skill-row-required-label">{row.mandatory ? "Required" : "Preferred"}</span>
                </label>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-sm"
                  onClick={() => removeSkillRow(index)}
                  aria-label={`Remove skill ${index + 1}`}
                  disabled={skillRows.length === 1}
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-sm add-row-btn" onClick={addSkillRow}>
            <Plus />
            Add skill
          </button>
          <span className="field-hint">Students missing a required skill are not eligible. Preferred skills only affect the match score.</span>
        </fieldset>

        <fieldset className="form-section">
          <legend>Description</legend>
          <div className="field">
            <label htmlFor="job-description" className="sr-only">
              Description
            </label>
            <textarea id="job-description" className={flash("description")} name="description" rows={6} value={form.description} onChange={handleChange} placeholder="What the role involves and who it suits." />
          </div>
        </fieldset>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="card-footer">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting && <Spinner />}
            Publish job
          </button>
        </div>
      </form>
    </section>
  );
}

export default JobForm;
