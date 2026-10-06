import { useState } from "react";
import { Award, ExternalLink, FolderGit2, Plus, Trash2 } from "lucide-react";
import { api } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { formatDate } from "../../lib/format";
import { Card, EmptyState, Spinner } from "../ui";

function safeLink(url) {
  return /^https?:\/\//i.test(url ?? "") ? url : null;
}

export function ProjectsCard({ projects, onChanged }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [form, setForm] = useState({ title: "", techStack: "", url: "", description: "" });

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/students/me/projects", {
        title: form.title.trim(),
        techStack: form.techStack.split(",").map((t) => t.trim()).filter(Boolean),
        url: form.url.trim() || undefined,
        description: form.description.trim() || undefined,
      });
      toast.success("Project added");
      setForm({ title: "", techStack: "", url: "", description: "" });
      setAdding(false);
      onChanged();
    } catch (err) {
      toast.error(err.message || "Could not add the project");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (project) => {
    setDeletingId(project.id);
    try {
      await api.delete(`/students/me/projects/${project.id}`);
      onChanged();
    } catch (err) {
      toast.error(err.message || "Could not remove the project");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card
      title="Projects"
      subtitle="Technologies used here count towards matching roles that need them"
      actions={
        !adding && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}>
            <Plus />
            Add project
          </button>
        )
      }
    >
      {adding && (
        <form className="stack extras-form" onSubmit={save}>
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="pr-title">Title</label>
              <input id="pr-title" required minLength={2} value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="e.g. Campus event booking app" />
            </div>
            <div className="field">
              <label htmlFor="pr-tech">Technologies</label>
              <input id="pr-tech" value={form.techStack} onChange={(e) => update("techStack", e.target.value)} placeholder="React, Node.js, MongoDB" />
              <span className="field-hint">Separate with commas</span>
            </div>
            <div className="field">
              <label htmlFor="pr-url">Link</label>
              <input id="pr-url" type="url" value={form.url} onChange={(e) => update("url", e.target.value)} placeholder="https://github.com/…" />
            </div>
            <div className="field span-2">
              <label htmlFor="pr-desc">What you built</label>
              <textarea id="pr-desc" rows={3} maxLength={600} value={form.description} onChange={(e) => update("description", e.target.value)} />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || form.title.trim().length < 2}>
              {saving && <Spinner />}
              Save project
            </button>
          </div>
        </form>
      )}

      {projects.length === 0 && !adding ? (
        <EmptyState compact icon={FolderGit2}>
          No projects yet. Add one, or upload a resume that lists them.
        </EmptyState>
      ) : (
        <ul className="extras-list">
          {projects.map((p) => (
            <li key={p.id}>
              <div className="extras-main">
                <strong>
                  {p.title}
                  {safeLink(p.url) && (
                    <a href={safeLink(p.url)} target="_blank" rel="noreferrer" aria-label={`Open ${p.title}`}>
                      <ExternalLink />
                    </a>
                  )}
                </strong>
                {p.description && <p>{p.description}</p>}
                {p.techStack?.length > 0 && (
                  <div className="tag-list">
                    {p.techStack.map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => remove(p)}
                disabled={deletingId === p.id}
                aria-label={`Remove ${p.title}`}
              >
                {deletingId === p.id ? <Spinner /> : <Trash2 />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function CertificationsCard({ certifications, onChanged }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [form, setForm] = useState({ name: "", issuer: "", issuedAt: "", url: "" });

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/students/me/certifications", {
        name: form.name.trim(),
        issuer: form.issuer.trim() || undefined,
        issuedAt: form.issuedAt ? new Date(`${form.issuedAt}T00:00:00`).toISOString() : undefined,
        url: form.url.trim() || undefined,
      });
      toast.success("Certification added");
      setForm({ name: "", issuer: "", issuedAt: "", url: "" });
      setAdding(false);
      onChanged();
    } catch (err) {
      toast.error(err.message || "Could not add the certification");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (cert) => {
    setDeletingId(cert.id);
    try {
      await api.delete(`/students/me/certifications/${cert.id}`);
      onChanged();
    } catch (err) {
      toast.error(err.message || "Could not remove the certification");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card
      title="Certifications"
      subtitle="Shown to recruiters. They add to your match score once verified."
      actions={
        !adding && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}>
            <Plus />
            Add
          </button>
        )
      }
    >
      {adding && (
        <form className="stack extras-form" onSubmit={save}>
          <div className="field">
            <label htmlFor="ce-name">Certification</label>
            <input id="ce-name" required minLength={2} value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. AWS Cloud Practitioner" />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="ce-issuer">Issued by</label>
              <input id="ce-issuer" value={form.issuer} onChange={(e) => update("issuer", e.target.value)} placeholder="e.g. Amazon Web Services" />
            </div>
            <div className="field">
              <label htmlFor="ce-date">Issued on</label>
              <input id="ce-date" type="date" value={form.issuedAt} onChange={(e) => update("issuedAt", e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="ce-url">Credential link</label>
            <input id="ce-url" type="url" value={form.url} onChange={(e) => update("url", e.target.value)} placeholder="https://…" />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || form.name.trim().length < 2}>
              {saving && <Spinner />}
              Save
            </button>
          </div>
        </form>
      )}

      {certifications.length === 0 && !adding ? (
        <EmptyState compact icon={Award}>
          No certifications added.
        </EmptyState>
      ) : (
        <ul className="extras-list">
          {certifications.map((c) => (
            <li key={c.id}>
              <div className="extras-main">
                <strong>
                  {c.name}
                  {safeLink(c.url) && (
                    <a href={safeLink(c.url)} target="_blank" rel="noreferrer" aria-label={`Open credential for ${c.name}`}>
                      <ExternalLink />
                    </a>
                  )}
                </strong>
                <span className="muted">
                  {[c.issuer, c.issuedAt ? formatDate(c.issuedAt) : null].filter(Boolean).join(" · ") || "Self-reported"}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => remove(c)}
                disabled={deletingId === c.id}
                aria-label={`Remove ${c.name}`}
              >
                {deletingId === c.id ? <Spinner /> : <Trash2 />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
