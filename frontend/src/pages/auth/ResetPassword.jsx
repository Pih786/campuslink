import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CircleCheck } from "lucide-react";
import { AuthLayout, PasswordInput } from "../../components/auth/AuthLayout";
import { Alert, Spinner } from "../../components/ui";
import { api } from "../../services/api";
import { passwordProblem } from "../../lib/password";

function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const next = {};
    const pw = passwordProblem(password);
    if (pw) next.password = pw;
    if (!pw && confirm !== password) next.confirm = "The passwords don't match";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setErrors({ submit: err.message || "Could not reset the password" });
    } finally {
      setSubmitting(false);
    }
  };

  let body;
  if (!token) {
    body = (
      <>
        <h1>Link incomplete</h1>
        <p>This reset link is missing its code. Open the link from the email again, or request a new one.</p>
        <Link to="/forgot-password" className="btn btn-primary btn-block">
          Request a new link
        </Link>
      </>
    );
  } else if (done) {
    body = (
      <div className="auth-done">
        <CircleCheck aria-hidden="true" />
        <h1>Password updated</h1>
        <p>You've been signed out everywhere else. Log in with your new password.</p>
        <Link to="/login" className="btn btn-primary btn-block">
          Log in
        </Link>
      </div>
    );
  } else {
    body = (
      <>
        <h1>Choose a new password</h1>
        <p>Pick something you don't use on other sites.</p>
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {errors.submit && (
            <Alert tone="error">
              {errors.submit} <Link to="/forgot-password">Request a new link</Link>
            </Alert>
          )}
          <div className="field">
            <label htmlFor="reset-password">New password</label>
            <PasswordInput
              id="reset-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrors({});
              }}
              className={errors.password ? "input-error" : ""}
              aria-invalid={Boolean(errors.password)}
              autoFocus
            />
            {errors.password ? (
              <span className="field-error">{errors.password}</span>
            ) : (
              <span className="field-hint">At least 8 characters, with a letter and a number.</span>
            )}
          </div>
          <div className="field">
            <label htmlFor="reset-confirm">Confirm new password</label>
            <PasswordInput
              id="reset-confirm"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setErrors({});
              }}
              className={errors.confirm ? "input-error" : ""}
              aria-invalid={Boolean(errors.confirm)}
            />
            {errors.confirm && <span className="field-error">{errors.confirm}</span>}
          </div>
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
            {submitting && <Spinner />}
            {submitting ? "Saving" : "Save new password"}
          </button>
        </form>
      </>
    );
  }

  return (
    <AuthLayout>
      <div className="auth-card">{body}</div>
    </AuthLayout>
  );
}

export default ResetPassword;
