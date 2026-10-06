import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, GitMerge, Landmark, Pencil } from "lucide-react";
import { api } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import Modal from "../../components/common/Modal";
import CollegePicker from "../../components/common/CollegePicker";
import { Alert, EmptyState, PageHeader, PageSkeleton, Spinner } from "../../components/ui";
import { relativeTime } from "../../lib/format";

// Colleges added by users during sign-up wait here until an admin verifies,
// corrects or merges them into an existing entry.
function AdminColleges() {
  const toast = useToast();
  const [colleges, setColleges] = useState([]);
  const [states, setStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [merging, setMerging] = useState(null);
  const [mergeInto, setMergeInto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get("/colleges/unverified");
      setColleges(res.data ?? []);
    } catch (err) {
      setError(err.message || "Could not load colleges");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    api
      .get("/colleges/states")
      .then((res) => setStates(res.data ?? []))
      .catch(() => {});
  }, [load]);

  const verify = async (college) => {
    setBusyId(college.id);
    try {
      await api.patch(`/colleges/${college.id}`, { verified: true });
      setColleges((prev) => prev.filter((c) => c.id !== college.id));
      toast.success(`${college.name} is now verified`);
    } catch (err) {
      toast.error(err.message || "Could not verify the college");
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const { id, name, city, state, category } = editing;
      const res = await api.patch(`/colleges/${id}`, {
        name: name.trim(),
        city: city.trim(),
        ...(state ? { state } : {}),
        category: category.trim(),
      });
      setColleges((prev) => prev.map((c) => (c.id === id ? { ...c, ...res.data } : c)));
      setEditing(null);
      toast.success("College updated");
    } catch (err) {
      setFormError(err.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const confirmMerge = async () => {
    if (!mergeInto) return setFormError("Choose the college to merge into");
    setSaving(true);
    setFormError("");
    try {
      const res = await api.post(`/colleges/${merging.id}/merge`, { intoId: mergeInto.id });
      setColleges((prev) => prev.filter((c) => c.id !== merging.id));
      setMerging(null);
      setMergeInto(null);
      toast.success(`Merged ${res.data.merged} into ${res.data.into}`);
    } catch (err) {
      setFormError(err.message || "Could not merge");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageSkeleton cards={1} />;

  return (
    <div className="page">
      <PageHeader
        title="New colleges"
        subtitle="Colleges people added at sign-up. Verify real ones, fix typos, or merge duplicates into the right entry."
      />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="card card-flush">
        {colleges.length === 0 ? (
          <EmptyState icon={Landmark} compact title="All caught up">
            There are no unverified colleges.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>College</th>
                  <th className="num">Students</th>
                  <th className="num">Staff</th>
                  <th>Added</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {colleges.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="cell-title">{c.name}</div>
                      <div className="cell-sub">{[c.city, c.state].filter(Boolean).join(", ") || "No location"}</div>
                    </td>
                    <td className="num">{c._count?.students ?? 0}</td>
                    <td className="num">{c._count?.staff ?? 0}</td>
                    <td className="muted">{relativeTime(c.createdAt)}</td>
                    <td className="col-actions">
                      <div className="row-tight">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyId === c.id}
                          onClick={() => verify(c)}
                        >
                          <BadgeCheck aria-hidden="true" />
                          Verify
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setFormError("");
                            setEditing({
                              id: c.id,
                              name: c.name,
                              city: c.city ?? "",
                              state: c.state ?? "",
                              category: c.category ?? "",
                            });
                          }}
                        >
                          <Pencil aria-hidden="true" />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setFormError("");
                            setMergeInto(null);
                            setMerging(c);
                          }}
                        >
                          <GitMerge aria-hidden="true" />
                          Merge
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={Boolean(editing)}
        title="Edit college"
        onClose={() => setEditing(null)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="submit" form="edit-college" className="btn btn-primary" disabled={saving}>
              {saving && <Spinner />}
              Save
            </button>
          </>
        }
      >
        {editing && (
          <form id="edit-college" className="stack" onSubmit={saveEdit}>
            {formError && <Alert tone="error">{formError}</Alert>}
            <div className="field">
              <label htmlFor="edit-college-name">Name</label>
              <input
                id="edit-college-name"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="edit-college-city">City</label>
                <input
                  id="edit-college-city"
                  value={editing.city}
                  onChange={(e) => setEditing({ ...editing, city: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="edit-college-state">State or UT</label>
                <select
                  id="edit-college-state"
                  value={editing.state}
                  onChange={(e) => setEditing({ ...editing, state: e.target.value })}
                >
                  <option value="">Select</option>
                  {states.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="edit-college-category">Category</label>
              <input
                id="edit-college-category"
                placeholder="e.g. State university, Private"
                value={editing.category}
                onChange={(e) => setEditing({ ...editing, category: e.target.value })}
              />
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(merging)}
        title="Merge duplicate college"
        subtitle={merging ? `Move everyone from “${merging.name}” into another college, then remove it.` : ""}
        onClose={() => setMerging(null)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setMerging(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={confirmMerge} disabled={saving || !mergeInto}>
              {saving && <Spinner />}
              Merge and remove
            </button>
          </>
        }
      >
        <div className="stack">
          {formError && <Alert tone="error">{formError}</Alert>}
          <div className="field">
            <label htmlFor="merge-into">Merge into</label>
            <CollegePicker id="merge-into" value={mergeInto} onChange={setMergeInto} />
            <span className="field-hint">Students, staff, drives and job targets move over. This can't be undone.</span>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default AdminColleges;
