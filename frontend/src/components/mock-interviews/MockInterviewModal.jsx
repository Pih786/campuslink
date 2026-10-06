import { useState } from "react";
import { api } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import Modal from "../common/Modal";
import { Alert, Spinner } from "../ui";

export const MOCK_CRITERIA = [
  { key: "technical", label: "Technical knowledge" },
  { key: "communication", label: "Communication" },
  { key: "problemSolving", label: "Problem solving" },
  { key: "confidence", label: "Confidence and presence" },
];

const today = () => new Date().toISOString().slice(0, 10);

// Placement office or mentor records a mock interview: four 0-10 scores,
// an optional skill it tested, and written feedback the student sees.
function MockInterviewModal({ open, onClose, onSaved, students = [], student = null }) {
  const toast = useToast();
  const [studentId, setStudentId] = useState(student?.id ?? "");
  const [scores, setScores] = useState({ technical: 6, communication: 6, problemSolving: 6, confidence: 6 });
  const [skillName, setSkillName] = useState("");
  const [focus, setFocus] = useState("");
  const [date, setDate] = useState(today());
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const overall = Math.round((Object.values(scores).reduce((a, b) => a + b, 0) / 4) * 10) / 10;

  const submit = async (e) => {
    e.preventDefault();
    const target = student?.id ?? studentId;
    if (!target) {
      setError("Choose a student.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api.post("/mock-interviews", {
        studentId: target,
        conductedAt: new Date(`${date}T${date === today() ? new Date().toTimeString().slice(0, 5) : "10:00"}:00`).toISOString(),
        focus: focus.trim() || undefined,
        skillName: skillName.trim() || undefined,
        ...scores,
        feedback: feedback.trim() || undefined,
      });
      const verified = res.data?.verifiedSkills ?? [];
      toast.success(
        verified.length
          ? `Recorded ${res.data.overallScore}/10. Verified: ${verified.join(", ")}.`
          : `Recorded ${res.data.overallScore}/10.`
      );
      onSaved?.(res.data);
      onClose();
    } catch (err) {
      setError(err.message || "Could not record the mock interview");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={600}
      title="Record a mock interview"
      subtitle={student ? student.user?.fullName : "The student sees the scores and your feedback."}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="mock-interview-form" className="btn btn-primary" disabled={busy}>
            {busy && <Spinner />}
            Save · {overall}/10
          </button>
        </>
      }
    >
      <form id="mock-interview-form" className="stack" onSubmit={submit}>
        {!student && (
          <div className="field">
            <label htmlFor="mock-student">Student</label>
            <select id="mock-student" value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
              <option value="">Choose a student</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.user?.fullName} · {s.department ?? "—"}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="form-grid">
          <div className="field">
            <label htmlFor="mock-skill">Skill tested (optional)</label>
            <input id="mock-skill" value={skillName} onChange={(e) => setSkillName(e.target.value)} placeholder="e.g. Java" maxLength={80} />
          </div>
          <div className="field">
            <label htmlFor="mock-date">Held on</label>
            <input id="mock-date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="field span-2">
            <label htmlFor="mock-focus">Focus (optional)</label>
            <input id="mock-focus" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. HR round, or DSA and projects" maxLength={120} />
          </div>
        </div>

        <div className="mock-sliders">
          {MOCK_CRITERIA.map((c) => (
            <label key={c.key} className="mock-slider">
              <span>{c.label}</span>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={scores[c.key]}
                onChange={(e) => setScores((prev) => ({ ...prev, [c.key]: Number(e.target.value) }))}
              />
              <output className="num">{scores[c.key]}</output>
            </label>
          ))}
        </div>
        <span className="field-hint">
          A score of 6 or more verifies Communication, and the skill tested if you name one. Jobs can set a minimum mock-interview
          score.
        </span>

        <div className="field">
          <label htmlFor="mock-feedback">Feedback for the student</label>
          <textarea
            id="mock-feedback"
            rows={4}
            maxLength={2000}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What went well, and the one or two things to practise next."
          />
        </div>

        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Modal>
  );
}

export default MockInterviewModal;
