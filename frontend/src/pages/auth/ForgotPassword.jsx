import { useState } from "react";
import { Link } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { Alert, Spinner } from "../../components/ui";
import { api } from "../../services/api";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return setError("Enter your email address");
    if (!EMAIL_PATTERN.test(email)) return setError("That doesn't look like a valid email address");

    setSubmitting(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim() });
      setSentTo(email.trim());
    } catch (err) {
      setError(err.message || "Could not send the reset link. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth-card">
        {sentTo ? (
          <div className="auth-done">
            <MailCheck aria-hidden="true" />
            <h1>Check your inbox</h1>
            <p>
              If an account exists for <strong>{sentTo}</strong>, we've sent a link to reset the password. It
              works once and expires in 30 minutes.
            </p>
            <p className="field-hint">Nothing arrived? Check spam, or try again in a few minutes.</p>
            <Link to="/login" className="btn btn-secondary btn-block">
              Back to log in
            </Link>
          </div>
        ) : (
          <>
            <h1>Reset your password</h1>
            <p>Enter the email you registered with and we'll send you a reset link.</p>

            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              {error && <Alert tone="error">{error}</Alert>}
              <div className="field">
                <label htmlFor="forgot-email">Email</label>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@college.edu"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                  }}
                  className={error ? "input-error" : ""}
                  aria-invalid={Boolean(error)}
                  autoFocus
                />
              </div>
              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
                {submitting && <Spinner />}
                {submitting ? "Sending" : "Send reset link"}
              </button>
            </form>

            <p className="auth-switch">
              Remembered it? <Link to="/login">Log in</Link>
            </p>
          </>
        )}
      </div>
    </AuthLayout>
  );
}

export default ForgotPassword;
