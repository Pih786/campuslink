import { useCallback, useEffect, useMemo, useState } from "react";
import { Award, CalendarDays, ChevronDown, FileSignature, MapPin } from "lucide-react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { formatDate, formatLpa } from "../../lib/format";
import AnimatedNumber from "../../components/common/AnimatedNumber";
import Modal from "../../components/common/Modal";
import OfferDocuments, { documentProgress } from "../../components/offers/OfferDocuments";
import { Alert, Avatar, EmptyState, PageHeader, PageSkeleton, Spinner, StatCard, StatusBadge } from "../../components/ui";

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "PENDING", label: "Awaiting reply" },
  { key: "DEFERRED", label: "Deferred" },
  { key: "ACCEPTED", label: "Accepted" },
  { key: "DECLINED", label: "Declined" },
  { key: "WITHDRAWN", label: "Withdrawn" },
  { key: "DOCS", label: "Documents to review" },
];

const LAKH = 100000;

function matchesFilter(offer, key) {
  if (key === "ALL") return true;
  if (key === "DOCS") return (offer.documents ?? []).some((d) => d.status === "SUBMITTED");
  return offer.acceptanceStatus === key;
}

function WithdrawModal({ offer, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await api.post(`/offers/${offer.id}/withdraw`, { reason: reason.trim() });
      toast.success("Offer withdrawn and the student notified");
      onDone();
    } catch (err) {
      toast.error(err.message || "Could not withdraw the offer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Withdraw this offer?"
      subtitle={`${offer.student?.user?.fullName ?? "Candidate"} · ${formatLpa(offer.ctc)}`}
      width={460}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Keep offer
          </button>
          <button type="button" className="btn btn-danger" onClick={submit} disabled={saving || reason.trim().length < 3}>
            {saving && <Spinner />}
            Withdraw offer
          </button>
        </>
      }
    >
      <p className="modal-text">The student is notified with the reason you give, and the application is closed.</p>
      <div className="field">
        <label htmlFor="withdraw-reason">Reason</label>
        <textarea
          id="withdraw-reason"
          rows={3}
          maxLength={300}
          placeholder="e.g. Role closed after a hiring freeze"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </Modal>
  );
}

function ConversionModal({ offer, onClose, onDone }) {
  const toast = useToast();
  const [converted, setConverted] = useState(true);
  const [ctcLpa, setCtcLpa] = useState(offer.ctc ? (offer.ctc / LAKH).toFixed(1) : "");
  const [joiningDate, setJoiningDate] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await api.post(`/offers/${offer.id}/conversion`, {
        converted,
        ctc: converted && ctcLpa ? Math.round(Number(ctcLpa) * LAKH) : undefined,
        joiningDate: converted && joiningDate ? new Date(`${joiningDate}T00:00:00`).toISOString() : undefined,
      });
      toast.success(converted ? "Pre-placement offer sent" : "Internship outcome recorded");
      onDone();
    } catch (err) {
      toast.error(err.message || "Could not record the outcome");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Internship outcome"
      subtitle={`${offer.student?.user?.fullName ?? "Candidate"} · ${offer.role ?? offer.job?.title ?? ""}`}
      width={480}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving || (converted && !ctcLpa)}>
            {saving && <Spinner />}
            {converted ? "Send pre-placement offer" : "Save outcome"}
          </button>
        </>
      }
    >
      <div className="segmented" role="group" aria-label="Outcome">
        <button type="button" aria-pressed={converted} onClick={() => setConverted(true)}>
          Converted to full-time
        </button>
        <button type="button" aria-pressed={!converted} onClick={() => setConverted(false)}>
          Not converted
        </button>
      </div>
      {converted && (
        <div className="form-grid">
          <div className="field">
            <label htmlFor="ppo-ctc">Full-time CTC (LPA)</label>
            <input id="ppo-ctc" type="number" min="0" step="0.1" value={ctcLpa} onChange={(e) => setCtcLpa(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ppo-join">Joining date</label>
            <input id="ppo-join" type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
          </div>
        </div>
      )}
      <p className="field-hint">
        {converted
          ? "A pre-placement offer is created and sent to the student to accept or decline."
          : "The internship is marked as not converted. No new offer is created."}
      </p>
    </Modal>
  );
}

function OffersManager() {
  const { user } = useAuth();
  const toast = useToast();
  const isRecruiter = user?.role === "RECRUITER";

  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [busyId, setBusyId] = useState(null);
  const [openDocs, setOpenDocs] = useState(() => new Set());
  const [withdrawing, setWithdrawing] = useState(null);
  const [converting, setConverting] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/offers?limit=100");
      setOffers(res.data ?? []);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load offers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const metrics = useMemo(() => {
    const live = offers.filter((o) => o.acceptanceStatus !== "WITHDRAWN");
    const accepted = live.filter((o) => o.acceptanceStatus === "ACCEPTED");
    const joined = accepted.filter((o) => o.joiningStatus === "JOINED");
    const ctcs = live.map((o) => o.ctc).filter((c) => c != null);
    const documents = offers.flatMap((o) => (o.acceptanceStatus === "WITHDRAWN" ? [] : o.documents ?? []));
    const now = new Date();
    return {
      total: live.length,
      pending: live.filter((o) => o.acceptanceStatus === "PENDING").length,
      deferred: live.filter((o) => o.acceptanceStatus === "DEFERRED").length,
      accepted: accepted.length,
      joined: joined.length,
      acceptanceRate: live.length ? Math.round((accepted.length / live.length) * 100) : 0,
      joiningRate: accepted.length ? Math.round((joined.length / accepted.length) * 100) : 0,
      avgCtc: ctcs.length ? ctcs.reduce((a, b) => a + b, 0) / ctcs.length : null,
      highestCtc: ctcs.length ? Math.max(...ctcs) : null,
      toReview: documents.filter((d) => d.status === "SUBMITTED").length,
      overdue: documents.filter(
        (d) => d.dueDate && ["REQUIRED", "REJECTED"].includes(d.status) && new Date(d.dueDate) < now
      ).length,
    };
  }, [offers]);

  const visible = offers.filter((o) => matchesFilter(o, filter));

  const updateJoining = async (offer, joiningStatus) => {
    setBusyId(offer.id);
    try {
      await api.patch(`/offers/${offer.id}`, { joiningStatus });
      toast.success(joiningStatus === "JOINED" ? "Marked as joined" : "Marked as did not join");
      await load();
    } catch (err) {
      toast.error(err.message || "Could not update joining status");
    } finally {
      setBusyId(null);
    }
  };

  const toggleDocs = (id) =>
    setOpenDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (loading) return <PageSkeleton stats={4} cards={2} />;

  return (
    <div className="page">
      <PageHeader title="Offers and joining" subtitle="Every offer from sent to joined, including documents and verification." />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="stat-grid">
        <StatCard
          label="Offers made"
          value={<AnimatedNumber value={metrics.total} />}
          meta={`${metrics.pending} awaiting reply · ${metrics.deferred} deferred`}
        />
        <StatCard
          label="Acceptance rate"
          value={
            <>
              <AnimatedNumber value={metrics.acceptanceRate} />
              <small>%</small>
            </>
          }
          meta={`${metrics.accepted} of ${metrics.total} accepted · avg ${formatLpa(metrics.avgCtc)}`}
        />
        <StatCard
          label="Joining rate"
          value={
            <>
              <AnimatedNumber value={metrics.joiningRate} />
              <small>%</small>
            </>
          }
          meta={`${metrics.joined} of ${metrics.accepted} joined`}
        />
        <StatCard
          label="Documents to review"
          value={<AnimatedNumber value={metrics.toReview} />}
          meta={metrics.overdue ? `${metrics.overdue} overdue from students` : "None overdue"}
        />
      </div>

      <div className="tabs" role="tablist">
        {FILTERS.map((f) => {
          const count = offers.filter((o) => matchesFilter(o, f.key)).length;
          if (count === 0 && !["ALL", "PENDING", "ACCEPTED"].includes(f.key)) return null;
          return (
            <button key={f.key} type="button" role="tab" className="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label} <span className="tab-count">{count}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Award} title={offers.length === 0 ? "No offers yet" : "No offers in this view"}>
          {offers.length === 0 ? "Make an offer from the pipeline once a candidate is selected." : null}
        </EmptyState>
      ) : (
        <div className="stack">
          {visible.map((offer) => {
            const name = offer.student?.user?.fullName ?? "Candidate";
            const status = offer.acceptanceStatus;
            const canMarkJoining = status === "ACCEPTED" && offer.joiningStatus === "PENDING";
            const canWithdraw = !["WITHDRAWN", "DECLINED"].includes(status) && offer.joiningStatus !== "JOINED";
            const canConvert = offer.offerType === "INTERNSHIP" && status === "ACCEPTED" && offer.conversionStatus === "PENDING";
            const progress = documentProgress(offer.documents);
            const docsOpen = openDocs.has(offer.id);
            return (
              <article key={offer.id} className="card offer-card">
                <div className="offer-card-head">
                  <Avatar name={name} />
                  <div className="offer-card-title">
                    <h3>{name}</h3>
                    <p>
                      {offer.role ?? offer.job?.title ?? "Role"}
                      {!isRecruiter && offer.company?.name ? ` · ${offer.company.name}` : ""}
                    </p>
                  </div>
                  <strong className="offer-card-ctc num">{formatLpa(offer.ctc)}</strong>
                </div>

                <div className="meta">
                  <StatusBadge kind="offerType" value={offer.offerType ?? "FULL_TIME"} />
                  {offer.location && (
                    <span>
                      <MapPin aria-hidden="true" />
                      {offer.location}
                    </span>
                  )}
                  <span>
                    <CalendarDays aria-hidden="true" />
                    Offered {formatDate(offer.offerDate)}
                  </span>
                  {offer.joiningDate && <span>Joins {formatDate(offer.joiningDate)}</span>}
                  {offer.bondRequired && (
                    <span>
                      <FileSignature aria-hidden="true" />
                      Bond
                    </span>
                  )}
                </div>

                {status === "DEFERRED" && offer.deferredUntil && (
                  <p className="offer-note">Student asked for time until {formatDate(offer.deferredUntil)}.</p>
                )}
                {status === "WITHDRAWN" && offer.withdrawnReason && (
                  <p className="offer-note is-bad">Withdrawn: {offer.withdrawnReason}</p>
                )}

                <div className="offer-card-foot">
                  <div className="row">
                    <StatusBadge kind="offer" value={status} />
                    {status === "ACCEPTED" && <StatusBadge kind="joining" value={offer.joiningStatus} />}
                    {offer.offerType === "INTERNSHIP" && offer.conversionStatus && (
                      <StatusBadge kind="conversion" value={offer.conversionStatus} />
                    )}
                  </div>
                  <div className="row">
                    {canWithdraw && (
                      <button type="button" className="btn btn-ghost btn-sm btn-danger-ghost" onClick={() => setWithdrawing(offer)}>
                        Withdraw
                      </button>
                    )}
                    {canConvert && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConverting(offer)}>
                        Record internship outcome
                      </button>
                    )}
                    {canMarkJoining && (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busyId === offer.id}
                          onClick={() => updateJoining(offer, "DID_NOT_JOIN")}
                        >
                          Did not join
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={busyId === offer.id}
                          onClick={() => updateJoining(offer, "JOINED")}
                        >
                          Mark joined
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {status !== "WITHDRAWN" && (
                  <div className="offer-docs">
                    <button type="button" className="offer-docs-toggle" onClick={() => toggleDocs(offer.id)} aria-expanded={docsOpen}>
                      <span>
                        Documents · {progress.verified} of {progress.total} verified
                        {progress.awaitingReview > 0 && (
                          <span className="offer-docs-due"> · {progress.awaitingReview} to review</span>
                        )}
                      </span>
                      <ChevronDown className={docsOpen ? "rotated" : ""} aria-hidden="true" />
                    </button>
                    {docsOpen && <OfferDocuments offer={offer} viewer="employer" onChanged={load} />}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {withdrawing && (
        <WithdrawModal
          offer={withdrawing}
          onClose={() => setWithdrawing(null)}
          onDone={() => {
            setWithdrawing(null);
            load();
          }}
        />
      )}
      {converting && (
        <ConversionModal
          offer={converting}
          onClose={() => setConverting(null)}
          onDone={() => {
            setConverting(null);
            load();
          }}
        />
      )}
    </div>
  );
}

export default OffersManager;
