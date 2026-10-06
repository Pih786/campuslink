import { useCallback, useEffect, useState } from "react";
import { Award, CalendarDays, ChevronDown, FileSignature, MapPin } from "lucide-react";
import { api } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { formatDate, formatLpa } from "../../lib/format";
import Modal from "../../components/common/Modal";
import OfferDocuments, { documentProgress } from "../../components/offers/OfferDocuments";
import { Alert, EmptyState, PageHeader, PageSkeleton, Spinner, StatusBadge } from "../../components/ui";

const DECISION_COPY = {
  ACCEPTED: {
    title: "Accept this offer?",
    button: "Accept offer",
    text: "The recruiter and placement office are told straight away. You can't undo this from here.",
  },
  DECLINED: {
    title: "Decline this offer?",
    button: "Decline offer",
    text: "Declining is final for this offer. Make sure you've discussed it with your placement office.",
  },
  DEFERRED: {
    title: "Ask for more time?",
    button: "Request deferral",
    text: "The recruiter and placement office see your deferral request and the date you'll decide by. You can accept or decline any time before then.",
  },
};

function toDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function StudentOffers() {
  const toast = useToast();

  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(null); // { offer, decision }
  const [deferUntil, setDeferUntil] = useState("");
  const [note, setNote] = useState("");
  const [responding, setResponding] = useState(false);
  const [openDocs, setOpenDocs] = useState(() => new Set());

  const load = useCallback(async () => {
    try {
      const res = await api.get("/offers");
      setOffers(res.data ?? []);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load your offers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openConfirm = (offer, decision) => {
    setConfirm({ offer, decision });
    setNote("");
    setDeferUntil(toDateInput(new Date(Date.now() + 7 * 24 * 60 * 60000)));
  };

  const respond = async () => {
    const { offer, decision } = confirm;
    setResponding(true);
    try {
      await api.post(`/offers/${offer.id}/respond`, {
        decision,
        deferredUntil: decision === "DEFERRED" ? new Date(`${deferUntil}T23:59:00`).toISOString() : undefined,
        note: note.trim() || undefined,
      });
      toast.success(
        decision === "ACCEPTED"
          ? `You accepted the offer from ${offer.company?.name ?? "the company"}`
          : decision === "DEFERRED"
            ? "Deferral requested"
            : "Offer declined"
      );
      setConfirm(null);
      load();
    } catch (err) {
      toast.error(err.message || "Could not send your response");
    } finally {
      setResponding(false);
    }
  };

  const toggleDocs = (id) =>
    setOpenDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (loading) return <PageSkeleton cards={2} />;

  const awaiting = offers.filter((o) => ["PENDING", "DEFERRED"].includes(o.acceptanceStatus));
  const sorted = [...awaiting, ...offers.filter((o) => !awaiting.includes(o))];
  const copy = confirm ? DECISION_COPY[confirm.decision] : null;

  return (
    <div className="page">
      <PageHeader title="Offers" subtitle="Review offer terms, send your decision and submit joining documents." />

      {error && <Alert tone="error">{error}</Alert>}

      {awaiting.length > 0 && (
        <Alert tone="info">
          {awaiting.length === 1 ? "One offer is" : `${awaiting.length} offers are`} waiting for your decision. Talk to
          your placement office before accepting if you have other processes running.
        </Alert>
      )}

      {offers.length === 0 ? (
        <EmptyState icon={Award} title="No offers yet">
          Offers appear here as soon as a recruiter sends one.
        </EmptyState>
      ) : (
        <div className="stack">
          {sorted.map((offer) => {
            const canRespond = ["PENDING", "DEFERRED"].includes(offer.acceptanceStatus);
            const progress = documentProgress(offer.documents);
            const docsOpen = openDocs.has(offer.id);
            const needsAction = (offer.documents ?? []).filter(
              (d) => d.type !== "OFFER_LETTER" && ["REQUIRED", "REJECTED"].includes(d.status)
            ).length;
            return (
              <article key={offer.id} className={`card offer-card ${canRespond ? "offer-card-pending" : ""}`}>
                <div className="offer-card-head">
                  <span className="company-mark" aria-hidden="true">
                    {(offer.company?.name ?? "?").charAt(0)}
                  </span>
                  <div className="offer-card-title">
                    <h3>{offer.company?.name ?? "Company"}</h3>
                    <p>{offer.role ?? offer.job?.title ?? "Role"}</p>
                  </div>
                  <div className="offer-ctc">
                    <span>Annual CTC</span>
                    <strong>{formatLpa(offer.ctc)}</strong>
                  </div>
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
                  {offer.joiningDate && <span>Joining {formatDate(offer.joiningDate)}</span>}
                  {offer.bondRequired && (
                    <span>
                      <FileSignature aria-hidden="true" />
                      Service bond
                    </span>
                  )}
                </div>

                {offer.acceptanceStatus === "DEFERRED" && offer.deferredUntil && (
                  <p className="offer-note">You asked for time until {formatDate(offer.deferredUntil)}.</p>
                )}
                {offer.acceptanceStatus === "WITHDRAWN" && (
                  <p className="offer-note is-bad">
                    Withdrawn by the company{offer.withdrawnReason ? `: ${offer.withdrawnReason}` : "."}
                  </p>
                )}

                <div className="offer-card-foot">
                  <div className="row">
                    <StatusBadge kind="offer" value={offer.acceptanceStatus} />
                    {offer.joiningStatus === "JOINED" && <StatusBadge kind="joining" value="JOINED" />}
                    {offer.offerType === "INTERNSHIP" && offer.conversionStatus && (
                      <StatusBadge kind="conversion" value={offer.conversionStatus} />
                    )}
                  </div>
                  {canRespond && (
                    <div className="row">
                      <button type="button" className="btn btn-ghost btn-sm btn-danger-ghost" onClick={() => openConfirm(offer, "DECLINED")}>
                        Decline
                      </button>
                      {offer.acceptanceStatus === "PENDING" && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openConfirm(offer, "DEFERRED")}>
                          Ask for time
                        </button>
                      )}
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => openConfirm(offer, "ACCEPTED")}>
                        Accept offer
                      </button>
                    </div>
                  )}
                </div>

                {offer.acceptanceStatus !== "WITHDRAWN" && progress.total > 0 && (
                  <div className="offer-docs">
                    <button type="button" className="offer-docs-toggle" onClick={() => toggleDocs(offer.id)} aria-expanded={docsOpen}>
                      <span>
                        Documents · {progress.verified} of {progress.total} verified
                        {needsAction > 0 && <span className="offer-docs-due"> · {needsAction} for you to upload</span>}
                      </span>
                      <ChevronDown className={docsOpen ? "rotated" : ""} aria-hidden="true" />
                    </button>
                    {docsOpen && <OfferDocuments offer={offer} viewer="student" onChanged={load} />}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={copy?.title}
        subtitle={`${confirm?.offer?.company?.name ?? ""} · ${formatLpa(confirm?.offer?.ctc)}`}
        width={460}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>
              Not now
            </button>
            <button
              type="button"
              className={`btn ${confirm?.decision === "DECLINED" ? "btn-danger" : "btn-primary"}`}
              onClick={respond}
              disabled={responding || (confirm?.decision === "DEFERRED" && !deferUntil)}
            >
              {responding && <Spinner />}
              {copy?.button}
            </button>
          </>
        }
      >
        <p className="modal-text">{copy?.text}</p>
        {confirm?.decision === "DEFERRED" && (
          <div className="field">
            <label htmlFor="defer-until">I'll decide by</label>
            <input
              id="defer-until"
              type="date"
              min={toDateInput(new Date())}
              value={deferUntil}
              onChange={(e) => setDeferUntil(e.target.value)}
            />
          </div>
        )}
        {confirm?.decision !== "ACCEPTED" && (
          <div className="field">
            <label htmlFor="offer-note">Note for the recruiter (optional)</label>
            <textarea id="offer-note" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}
      </Modal>
    </div>
  );
}

export default StudentOffers;
