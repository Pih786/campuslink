import { useState } from "react";
import { Clock3, LogOut, RefreshCw, ShieldX } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { AuthLayout } from "../auth/AuthLayout";
import { Alert, Spinner } from "../ui";

const ROLE_LABEL = { PLACEMENT_OFFICER: "placement office", MENTOR: "mentor" };

// Shown to officers and mentors until someone approves their account.
function PendingApproval() {
  const { user, refresh, logout } = useAuth();
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState("");
  const rejected = user.staffStatus === "REJECTED";

  const checkAgain = async () => {
    setChecking(true);
    setNote("");
    try {
      const next = await refresh();
      if (next.staffStatus === "PENDING") setNote("Still waiting. We'll notify you here as soon as it's reviewed.");
    } catch {
      setNote("Couldn't reach the server. Try again in a moment.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth-card">
        <div className="auth-done">
          {rejected ? <ShieldX aria-hidden="true" className="icon-danger" /> : <Clock3 aria-hidden="true" />}
          <h1>{rejected ? "Access not approved" : "Waiting for approval"}</h1>
          {rejected ? (
            <p>
              Your request to join <strong>{user.collegeName || "this college"}</strong> as {ROLE_LABEL[user.role]}{" "}
              staff was declined. If this is a mistake, contact your college's placement office.
            </p>
          ) : (
            <p>
              You asked to join <strong>{user.collegeName || "your college"}</strong> as {ROLE_LABEL[user.role]}{" "}
              staff. Your college's placement office reviews new staff accounts, or the CampusLink team if you're
              the first one from your college. Student data stays hidden until then.
            </p>
          )}
          {note && <Alert tone="info">{note}</Alert>}
          <div className="auth-done-actions">
            {!rejected && (
              <button type="button" className="btn btn-primary btn-block" onClick={checkAgain} disabled={checking}>
                {checking ? <Spinner /> : <RefreshCw aria-hidden="true" />}
                Check again
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-block" onClick={logout}>
              <LogOut aria-hidden="true" />
              Log out
            </button>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}

export default PendingApproval;
