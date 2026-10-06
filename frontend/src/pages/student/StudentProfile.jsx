import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, FileText, Pencil, Plus, Upload } from "lucide-react";
import { api, downloadFile } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { BRANCHES } from "../../lib/branches";
import { Alert, Avatar, Card, EmptyState, PageHeader, PageSkeleton, Spinner } from "../../components/ui";
import { CertificationsCard, ProjectsCard } from "../../components/student/ProfileExtras";

const LEVELS = [
  { value: 1, label: "1 · Beginner" },
  { value: 2, label: "2 · Basic" },
  { value: 3, label: "3 · Working" },
  { value: 4, label: "4 · Strong" },
  { value: 5, label: "5 · Expert" },
];

function formFromProfile(student) {
  return {
    department: student.department ?? "",
    graduationYear: student.graduationYear ?? "",
    cgpa: student.cgpa ?? "",
    backlogCount: student.backlogCount ?? 0,
    phone: student.phone ?? "",
  };
}

function StudentProfile() {
  const { user } = useAuth();
  const toast = useToast();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);

  const [newSkill, setNewSkill] = useState({ skillName: "", proficiency: 3 });
  const [addingSkill, setAddingSkill] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/students/me");
      setProfile(res.data);
      setForm(formFromProfile(res.data));
      setError("");
    } catch (err) {
      setError(err.message || "Could not load your profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleFieldChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/students/me", {
        department: form.department,
        graduationYear: Number(form.graduationYear),
        cgpa: Number(form.cgpa),
        backlogCount: Number(form.backlogCount),
        phone: form.phone,
      });
      toast.success("Profile saved");
      setEditing(false);
      await load();
    } catch (err) {
      toast.error(err.message || "Could not save your profile");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setForm(formFromProfile(profile));
    setEditing(false);
  };

  const handleAddSkill = async (e) => {
    e.preventDefault();
    const skillName = newSkill.skillName.trim();
    if (!skillName) return;
    setAddingSkill(true);
    try {
      await api.post("/students/me/skills", { skillName, proficiency: Number(newSkill.proficiency) });
      setNewSkill({ skillName: "", proficiency: 3 });
      toast.success(`${skillName} added`);
      await load();
    } catch (err) {
      toast.error(err.message || "Could not add that skill");
    } finally {
      setAddingSkill(false);
    }
  };

  const handleResumeUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingResume(true);
    try {
      const formData = new FormData();
      formData.append("resume", file);
      const res = await api.postForm("/students/me/resume", formData);
      const found = res.extracted ?? {};
      const parts = [
        found.skillsAdded ? `${found.skillsAdded} skill${found.skillsAdded === 1 ? "" : "s"}` : null,
        found.projectsAdded ? `${found.projectsAdded} project${found.projectsAdded === 1 ? "" : "s"}` : null,
        found.certificationsAdded ? `${found.certificationsAdded} certification${found.certificationsAdded === 1 ? "" : "s"}` : null,
      ].filter(Boolean);
      if (!found.textExtracted) toast.info("Resume saved. We couldn't read text from this file, so nothing was added automatically.");
      else if (parts.length) toast.success(`Resume saved. Added ${parts.join(", ")} found in it.`);
      else toast.success("Resume saved. Everything in it was already on your profile.");
      await load();
    } catch (err) {
      toast.error(err.message || "Could not upload your resume");
    } finally {
      setUploadingResume(false);
    }
  };

  if (loading) return <PageSkeleton cards={3} />;
  if (!profile) return <div className="page">{error && <Alert tone="error">{error}</Alert>}</div>;

  const completion = profile.profileCompletion ?? 0;
  const skills = [...(profile.skills ?? [])].sort((a, b) => (a.skill?.name ?? "").localeCompare(b.skill?.name ?? ""));
  const branchKnown = BRANCHES.some((b) => b.code === form.department);

  return (
    <div className="page">
      <PageHeader
        title="Profile"
        subtitle="Recruiters see this, and it decides which roles you're eligible for."
      />

      {error && <Alert tone="error">{error}</Alert>}

      <section className="card profile-hero">
        <Avatar name={user?.fullName} size="lg" />
        <div className="profile-hero-main">
          <h2>{user?.fullName}</h2>
          <p>{user?.email}</p>
          <div className="tag-list">
            <span className="tag">{profile.department || "Branch not set"}</span>
            <span className="tag">CGPA {profile.cgpa || "—"}</span>
            <span className="tag">Class of {profile.graduationYear ?? "—"}</span>
            <span className="tag">
              {profile.backlogCount ?? 0} backlog{profile.backlogCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <div className="profile-hero-meter">
          <div className="profile-hero-meter-head">
            <span>Profile completeness</span>
            <strong className="num">{completion}%</strong>
          </div>
          <div className={`progress ${completion >= 100 ? "progress-success" : ""}`}>
            <span style={{ width: `${completion}%` }} />
          </div>
        </div>
      </section>

      <div className="split">
        <div className="stack">
          <Card
            title="Academic details"
            subtitle="Used for CGPA, branch and backlog cut-offs"
            actions={
              !editing && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                  <Pencil />
                  Edit
                </button>
              )
            }
          >
            {editing ? (
              <form className="stack" onSubmit={handleSave}>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="pf-department">Branch</label>
                    <select id="pf-department" name="department" value={form.department} onChange={handleFieldChange}>
                      <option value="">Select branch</option>
                      {!branchKnown && form.department && <option value={form.department}>{form.department}</option>}
                      {BRANCHES.map((b) => (
                        <option key={b.code} value={b.code}>
                          {b.code} · {b.label}
                        </option>
                      ))}
                    </select>
                    {!branchKnown && form.department && (
                      <span className="field-hint">
                        Pick a branch code from the list so recruiters' branch filters recognise you.
                      </span>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor="pf-year">Graduation year</label>
                    <input id="pf-year" name="graduationYear" type="number" min="2000" max="2100" value={form.graduationYear} onChange={handleFieldChange} />
                  </div>
                  <div className="field">
                    <label htmlFor="pf-cgpa">CGPA</label>
                    <input id="pf-cgpa" name="cgpa" type="number" step="0.01" min="0" max="10" value={form.cgpa} onChange={handleFieldChange} />
                    <span className="field-hint">On a 10-point scale</span>
                  </div>
                  <div className="field">
                    <label htmlFor="pf-backlogs">Active backlogs</label>
                    <input id="pf-backlogs" name="backlogCount" type="number" min="0" value={form.backlogCount} onChange={handleFieldChange} />
                  </div>
                  <div className="field span-2">
                    <label htmlFor="pf-phone">Phone</label>
                    <input id="pf-phone" name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={handleFieldChange} />
                  </div>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-ghost" onClick={cancelEdit} disabled={saving}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving && <Spinner />}
                    Save changes
                  </button>
                </div>
              </form>
            ) : (
              <dl className="kv-grid">
                <div className="kv">
                  <dt>Branch</dt>
                  <dd>{profile.department || "—"}</dd>
                </div>
                <div className="kv">
                  <dt>Graduation year</dt>
                  <dd>{profile.graduationYear ?? "—"}</dd>
                </div>
                <div className="kv">
                  <dt>CGPA</dt>
                  <dd className="num">{profile.cgpa || "—"}</dd>
                </div>
                <div className="kv">
                  <dt>Active backlogs</dt>
                  <dd className="num">{profile.backlogCount ?? 0}</dd>
                </div>
                <div className="kv">
                  <dt>Phone</dt>
                  <dd>{profile.phone || "—"}</dd>
                </div>
              </dl>
            )}
          </Card>

          <Card title="Skills" subtitle="Self-rated levels. Verified skills come from labs and assessments.">
            {skills.length === 0 ? (
              <EmptyState compact>No skills yet. Add a few below or upload your resume to detect them.</EmptyState>
            ) : (
              <div className="tag-list">
                {skills.map((s) => (
                  <span key={s.id ?? s.skillId} className={`tag ${s.verified ? "tag-success" : ""}`} title={s.verified ? "Verified" : "Self-declared"}>
                    {s.verified && <BadgeCheck aria-label="Verified" />}
                    {s.skill?.name ?? s.name}
                    <span className="tag-level">L{s.proficiency}</span>
                  </span>
                ))}
              </div>
            )}

            <form className="inline-form" onSubmit={handleAddSkill}>
              <input
                aria-label="Skill name"
                placeholder="Add a skill, e.g. React"
                value={newSkill.skillName}
                onChange={(e) => setNewSkill((prev) => ({ ...prev, skillName: e.target.value }))}
              />
              <select
                aria-label="Proficiency level"
                value={newSkill.proficiency}
                onChange={(e) => setNewSkill((prev) => ({ ...prev, proficiency: e.target.value }))}
              >
                {LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-secondary" disabled={addingSkill || !newSkill.skillName.trim()}>
                {addingSkill ? <Spinner /> : <Plus />}
                Add
              </button>
            </form>
          </Card>

          <ProjectsCard projects={profile.projects ?? []} onChanged={load} />
        </div>

        <div className="stack">
        <Card title="Resume" subtitle="PDF, DOCX or TXT. Skills, projects and certifications in it are added automatically.">
          {profile.resumeUrl ? (
            <div className="file-row">
              <span className="file-row-icon">
                <FileText aria-hidden="true" />
              </span>
              <div className="list-row-main">
                <strong>Resume on file</strong>
                <button
                  type="button"
                  className="link-button"
                  onClick={() =>
                    downloadFile("/students/me/resume/file", "resume" + (profile.resumeUrl.match(/.w+$/)?.[0] ?? "")).catch((err) =>
                      toast.error(err.message || "Could not download your resume")
                    )
                  }
                >
                  Download current file
                </button>
              </div>
            </div>
          ) : (
            <EmptyState compact icon={FileText}>
              No resume yet. Upload one, or <Link to="/student/cv">build it with the CV maker</Link> from your profile.
            </EmptyState>
          )}

          <label className={`btn btn-secondary btn-block upload-btn ${uploadingResume ? "is-busy" : ""}`}>
            {uploadingResume ? <Spinner /> : <Upload />}
            {uploadingResume ? "Uploading" : profile.resumeUrl ? "Replace resume" : "Upload resume"}
            <input type="file" accept=".pdf,.docx,.txt" className="sr-only" onChange={handleResumeUpload} disabled={uploadingResume} />
          </label>
        </Card>

        <CertificationsCard certifications={profile.certifications ?? []} onChanged={load} />
        </div>
      </div>
    </div>
  );
}

export default StudentProfile;
