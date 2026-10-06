import { useCallback, useEffect, useState } from "react";
import { Library, Plus, Search } from "lucide-react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import Modal from "../../components/common/Modal";
import ResourceItem, { RESOURCE_TYPES } from "../../components/learning/ResourceItem";
import { Alert, EmptyState, PageHeader, Spinner } from "../../components/ui";

const EMPTY = { skillName: "", title: "", url: "", type: "COURSE", provider: "", level: "", durationMinutes: "", description: "" };

function LearningLibrary() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "ADMIN";
  const [items, setItems] = useState(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (type) params.set("type", type);
    try {
      const res = await api.get(`/learning/resources?${params}`);
      setItems(res.data ?? []);
    } catch {
      setItems([]);
    }
  }, [query, type]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/learning/resources", {
        skillName: form.skillName.trim(),
        title: form.title.trim(),
        url: form.url.trim(),
        type: form.type,
        ...(form.provider.trim() ? { provider: form.provider.trim() } : {}),
        ...(form.level ? { level: form.level } : {}),
        ...(form.durationMinutes ? { durationMinutes: Number(form.durationMinutes) } : {}),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
      });
      toast.success("Added to the library");
      setAdding(false);
      setForm(EMPTY);
      load();
    } catch (err) {
      const first = err.details?.details?.[0];
      setError(first ? `${first.path}: ${first.message}` : err.message || "Could not add");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (resource) => {
    if (!window.confirm(`Remove “${resource.title}” from the library?`)) return;
    try {
      await api.delete(`/learning/resources/${resource.id}`);
      setItems((prev) => prev.filter((r) => r.id !== resource.id));
      toast.success("Removed");
    } catch (err) {
      toast.error(err.message || "Could not remove");
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Learning library"
        subtitle={
          isAdmin
            ? "Material shared with every college. Students see it in their learning plan and the AI tutor cites it."
            : `The shared library plus material added by ${user?.collegeName ?? "your college"}. Students see it in their learning plan.`
        }
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setForm(EMPTY);
              setError("");
              setAdding(true);
            }}
          >
            <Plus />
            Add material
          </button>
        }
      />

      <div className="toolbar">
        <label className="search-input">
          <Search aria-hidden="true" />
          <input type="search" placeholder="Search by skill, title or provider" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the library" />
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
          <EmptyState compact icon={Library} title="Nothing matches" />
        ) : (
          <ul className="resource-list">
            {items.map((r) => (
              <ResourceItem key={r.id} resource={r} showSkill onDelete={remove} />
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={adding}
        width={600}
        onClose={() => setAdding(false)}
        title="Add learning material"
        subtitle={isAdmin ? "Shared with every college." : `Visible to students of ${user?.collegeName ?? "your college"}.`}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button type="submit" form="add-resource" className="btn btn-primary" disabled={busy}>
              {busy && <Spinner />}
              Add
            </button>
          </>
        }
      >
        <form id="add-resource" className="stack" onSubmit={submit}>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Skill</span>
              <input value={form.skillName} onChange={set("skillName")} placeholder="e.g. React" required maxLength={80} />
            </label>
            <label className="field">
              <span className="field-label">Type</span>
              <select value={form.type} onChange={set("type")}>
                {Object.entries(RESOURCE_TYPES).map(([value, t]) => (
                  <option key={value} value={value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field span-2">
              <span className="field-label">Title</span>
              <input value={form.title} onChange={set("title")} required minLength={3} maxLength={200} />
            </label>
            <label className="field span-2">
              <span className="field-label">Link</span>
              <input type="url" value={form.url} onChange={set("url")} placeholder="https://" required />
            </label>
            <label className="field">
              <span className="field-label">Provider</span>
              <input value={form.provider} onChange={set("provider")} placeholder="e.g. NPTEL" maxLength={80} />
            </label>
            <label className="field">
              <span className="field-label">Level</span>
              <select value={form.level} onChange={set("level")}>
                <option value="">Any</option>
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Length (minutes)</span>
              <input type="number" min={1} value={form.durationMinutes} onChange={set("durationMinutes")} />
            </label>
            <label className="field span-2">
              <span className="field-label">Why it's useful</span>
              <textarea rows={2} maxLength={400} value={form.description} onChange={set("description")} />
            </label>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default LearningLibrary;
