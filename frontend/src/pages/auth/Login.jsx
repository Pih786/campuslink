import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ROLE_HOME } from "../../components/common/ProtectedRoute";
import { AuthLayout, PasswordInput } from "../../components/auth/AuthLayout";
import { Alert, Spinner } from "../../components/ui";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [formData, setFormData] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "", login: "" }));
  };

  const validate = () => {
    const next = {};
    if (!formData.email.trim()) next.email = "Enter your email address";
    else if (!EMAIL_PATTERN.test(formData.email)) next.email = "That doesn't look like a valid email address";
    if (!formData.password) next.password = "Enter your password";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const user = await login({ email: formData.email.trim(), password: formData.password });
      navigate(ROLE_HOME[user.role] || "/");
    } catch (err) {
      setErrors({ login: err.message || "Invalid email or password" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth-card">
        <h1>Log in</h1>
        <p>Welcome back. Use the email you registered with.</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {errors.login && <Alert tone="error">{errors.login}</Alert>}

          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@college.edu"
              value={formData.email}
              onChange={handleChange}
              className={errors.email ? "input-error" : ""}
              aria-invalid={Boolean(errors.email)}
              autoFocus
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="field">
            <div className="label-row">
              <label htmlFor="login-password">Password</label>
              <Link to="/forgot-password" className="label-link">
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="login-password"
              name="password"
              autoComplete="current-password"
              value={formData.password}
              onChange={handleChange}
              className={errors.password ? "input-error" : ""}
              aria-invalid={Boolean(errors.password)}
            />
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>

          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
            {submitting && <Spinner />}
            {submitting ? "Logging in" : "Log in"}
          </button>
        </form>

        <p className="auth-switch">
          New to CampusLink? <Link to="/signup">Create an account</Link>
        </p>
      </div>
    </AuthLayout>
  );
}

export default Login;
