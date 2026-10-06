import { useState } from "react";
import Modal from "../common/Modal";
import { Alert, Spinner } from "../ui";
import { api } from "../../services/api";

const LAKH = 100000;

function defaultCtcLpa(job) {
  const salary = job?.salaryMax ?? job?.salaryMin;
  return salary ? (salary / LAKH).toFixed(1) : "";
}

function MakeOfferModal({ open, application, onClose, onDone }) {
  const job = application?.job;

  const [form, setForm] = useState(() => ({
    ctcLpa: defaultCtcLpa(job),
    role: job?.title ?? "",
    location: job?.location ?? "",
    joiningDate: "",
    bondRequired: false,
    offerType: "FULL_TIME",
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await api.post("/offers", {
        applicationId: application.id,
        ctc: form.ctcLpa ? Math.round(Number(form.ctcLpa) * LAKH) : undefined,
        role: form.role || undefined,
        location: form.location || undefined,
        joiningDate: form.joiningDate
          ? new Date(`${form.joiningDate}T00:00:00`).toISOString()
          : undefined,
        bondRequired: form.bondRequired,
        offerType: form.offerType,
      });
      onDone?.();
    } catch (err) {
      setError(err.message || "Could not create offer");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Make an offer"
      subtitle={`${application?.student?.user?.fullName ?? "Candidate"} · ${job?.title ?? ""}`}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="make-offer-form" className="btn btn-primary" disabled={submitting}>
            {submitting && <Spinner />}
            Send offer
          </button>
        </>
      }
    >
      <form id="make-offer-form" onSubmit={handleSubmit}>
        <div className="segmented" role="group" aria-label="Offer type">
          {[
            ["FULL_TIME", "Full-time"],
            ["INTERNSHIP", "Internship"],
            ["PPO", "Pre-placement offer"],
          ].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={form.offerType === value} onClick={() => update("offerType", value)}>
              {label}
            </button>
          ))}
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="offer-ctc">{form.offerType === "INTERNSHIP" ? "Stipend, annualised (LPA)" : "Annual CTC (LPA)"}</label>
            <input
              id="offer-ctc"
              type="number"
              step="0.1"
              min="0"
              required
              placeholder="e.g. 8.5"
              value={form.ctcLpa}
              onChange={(e) => update("ctcLpa", e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="offer-join">Joining date</label>
            <input
              id="offer-join"
              type="date"
              value={form.joiningDate}
              onChange={(e) => update("joiningDate", e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="offer-role">Role</label>
            <input id="offer-role" value={form.role} onChange={(e) => update("role", e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="offer-location">Location</label>
            <input id="offer-location" value={form.location} onChange={(e) => update("location", e.target.value)} />
          </div>
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={form.bondRequired}
            onChange={(e) => update("bondRequired", e.target.checked)}
          />
          Service bond required
        </label>

        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Modal>
  );
}

export default MakeOfferModal;
