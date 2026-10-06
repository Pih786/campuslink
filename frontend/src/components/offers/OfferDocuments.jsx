import { useState } from "react";
import { Check, Download, FileText, Plus, Upload, X } from "lucide-react";
import { api, downloadFile } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { formatDate } from "../../lib/format";
import { Spinner, StatusBadge } from "../ui";

export const DOCUMENT_LABELS = {
  OFFER_LETTER: "Offer letter",
  SIGNED_ACCEPTANCE: "Signed acceptance",
  ID_PROOF: "ID proof",
  MARKSHEETS: "Marksheets",
  DEGREE_CERTIFICATE: "Degree certificate",
  BOND_AGREEMENT: "Bond agreement",
  MEDICAL_CERTIFICATE: "Medical certificate",
  OTHER: "Other document",
};

const EMPLOYER_DOCUMENTS = ["OFFER_LETTER"];

export function documentProgress(documents = []) {
  const verified = documents.filter((d) => d.status === "VERIFIED").length;
  const awaitingReview = documents.filter((d) => d.status === "SUBMITTED").length;
  return { verified, awaitingReview, total: documents.length };
}

function isOverdue(doc) {
  return doc.dueDate && ["REQUIRED", "REJECTED"].includes(doc.status) && new Date(doc.dueDate) < new Date();
}

// viewer: "student" uploads their own documents; "employer" uploads the
// offer letter and verifies what the student submits.
function OfferDocuments({ offer, viewer, onChanged }) {
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [requestType, setRequestType] = useState("");

  const documents = offer.documents ?? [];
  const missingTypes = Object.keys(DOCUMENT_LABELS).filter((t) => !documents.some((d) => d.type === t));

  const upload = async (doc, file) => {
    if (!file) return;
    setBusyId(doc.id);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.postForm(`/offers/${offer.id}/documents/${doc.id}/upload`, form);
      toast.success(`${DOCUMENT_LABELS[doc.type]} uploaded`);
      onChanged?.();
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      setBusyId(null);
    }
  };

  const review = async (doc, status, note) => {
    setBusyId(doc.id);
    try {
      await api.post(`/offers/${offer.id}/documents/${doc.id}/review`, { status, note: note || undefined });
      toast.success(status === "VERIFIED" ? `${DOCUMENT_LABELS[doc.type]} verified` : "Sent back to the student");
      setRejecting(null);
      setRejectNote("");
      onChanged?.();
    } catch (err) {
      toast.error(err.message || "Could not save the review");
    } finally {
      setBusyId(null);
    }
  };

  const requestDocument = async () => {
    if (!requestType) return;
    try {
      const due = new Date(Date.now() + 7 * 24 * 60 * 60000).toISOString();
      await api.post(`/offers/${offer.id}/documents`, { type: requestType, dueDate: due });
      toast.success(`${DOCUMENT_LABELS[requestType]} requested`);
      setRequestType("");
      onChanged?.();
    } catch (err) {
      toast.error(err.message || "Could not request the document");
    }
  };

  const download = async (doc) => {
    try {
      await downloadFile(`/offers/${offer.id}/documents/${doc.id}/file`, doc.fileName || DOCUMENT_LABELS[doc.type]);
    } catch (err) {
      toast.error(err.message || "Could not download the file");
    }
  };

  return (
    <div className="doc-list">
      {documents.length === 0 && <p className="muted">No documents on the checklist.</p>}
      {documents.map((doc) => {
        const employerDoc = EMPLOYER_DOCUMENTS.includes(doc.type);
        const canUpload =
          doc.status !== "VERIFIED" && ((viewer === "student" && !employerDoc) || (viewer === "employer" && employerDoc));
        const canReview = viewer === "employer" && doc.status === "SUBMITTED";
        const busy = busyId === doc.id;

        return (
          <div key={doc.id} className={`doc-row ${isOverdue(doc) ? "is-overdue" : ""}`}>
            <span className="doc-icon" aria-hidden="true">
              <FileText />
            </span>
            <div className="doc-main">
              <div className="doc-title">
                <strong>{DOCUMENT_LABELS[doc.type]}</strong>
                <StatusBadge kind="document" value={doc.status} />
              </div>
              <span className="doc-meta">
                {employerDoc ? "Provided by the employer" : "Provided by the student"}
                {doc.dueDate && ["REQUIRED", "REJECTED"].includes(doc.status) && (
                  <> · {isOverdue(doc) ? "Overdue since" : "Due"} {formatDate(doc.dueDate)}</>
                )}
                {doc.submittedAt && doc.status !== "REQUIRED" && <> · Uploaded {formatDate(doc.submittedAt)}</>}
              </span>
              {doc.status === "REJECTED" && doc.note && <span className="doc-note">Reviewer: {doc.note}</span>}

              {rejecting === doc.id && (
                <div className="doc-reject">
                  <input
                    autoFocus
                    placeholder="What needs fixing?"
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    aria-label="Reason for sending back"
                  />
                  <button type="button" className="btn btn-danger btn-sm" disabled={!rejectNote.trim() || busy} onClick={() => review(doc, "REJECTED", rejectNote)}>
                    Send back
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRejecting(null)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="doc-actions">
              {busy && <Spinner />}
              {doc.fileUrl && (
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => download(doc)} aria-label={`Download ${DOCUMENT_LABELS[doc.type]}`} title="Download">
                  <Download />
                </button>
              )}
              {canReview && rejecting !== doc.id && (
                <>
                  <button type="button" className="btn btn-ghost btn-sm btn-danger-ghost" disabled={busy} onClick={() => setRejecting(doc.id)}>
                    <X />
                    Reject
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => review(doc, "VERIFIED")}>
                    <Check />
                    Verify
                  </button>
                </>
              )}
              {canUpload && (
                <label className={`btn btn-secondary btn-sm ${busy ? "is-busy" : ""}`}>
                  <Upload />
                  {doc.fileUrl ? "Replace" : "Upload"}
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; upload(doc, f); }} />
                </label>
              )}
            </div>
          </div>
        );
      })}

      {viewer === "employer" && missingTypes.length > 0 && (
        <div className="doc-request">
          <select value={requestType} onChange={(e) => setRequestType(e.target.value)} aria-label="Request another document">
            <option value="">Request another document…</option>
            {missingTypes
              .filter((t) => !EMPLOYER_DOCUMENTS.includes(t))
              .map((t) => (
                <option key={t} value={t}>
                  {DOCUMENT_LABELS[t]}
                </option>
              ))}
          </select>
          <button type="button" className="btn btn-secondary btn-sm" onClick={requestDocument} disabled={!requestType}>
            <Plus />
            Request
          </button>
        </div>
      )}
      <p className="field-hint">PDF, PNG or JPG up to 10 MB. Files are private to the student, the employer and the placement office.</p>
    </div>
  );
}

export default OfferDocuments;
