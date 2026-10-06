import { useState } from "react";
import { FileText } from "lucide-react";
import { downloadFile } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { Spinner } from "../ui";

// Downloads a student's resume through the access-checked endpoint.
function ResumeButton({ studentId, name, compact = false }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      await downloadFile(`/students/${studentId}/resume/file`, `${name ?? "student"} resume`);
    } catch (err) {
      toast.error(err.message || "Could not download the resume");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm ${compact ? "btn-icon" : ""}`}
      onClick={download}
      disabled={busy}
      aria-label={`Download ${name ?? "student"}'s resume`}
      title="Download resume"
    >
      {busy ? <Spinner /> : <FileText />}
      {!compact && "Resume"}
    </button>
  );
}

export default ResumeButton;
