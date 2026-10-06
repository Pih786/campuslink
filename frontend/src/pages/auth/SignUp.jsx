import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Briefcase, GraduationCap, HeartHandshake, Landmark } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ROLE_HOME } from "../../components/common/ProtectedRoute";
import { AuthLayout, PasswordInput } from "../../components/auth/AuthLayout";
import CollegePicker from "../../components/common/CollegePicker";
import { Alert, Spinner } from "../../components/ui";
import { BRANCHES } from "../../lib/branches";
import { api } from "../../services/api";
import { passwordProblem } from "../../lib/password";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLES = [
  {
    value: "STUDENT",
    label: "Student",
    hint: "Apply to roles you qualify for",
    icon: GraduationCap,
    emailLabel: "College email",
    designationLabel: "Branch",
  },
  {
    value: "RECRUITER",
    label: "Recruiter",
    hint: "Post roles and hire from campus",
    icon: Briefcase,
    emailLabel: "Work email",
    designationLabel: "Your title",
    designationPlaceholder: "e.g. Talent Acquisition Lead",
  },
  {
    value: "PLACEMENT_OFFICER",
    label: "Placement office",
    hint: "Run drives and track outcomes",
    icon: Landmark,
    emailLabel: "Official email",
    designationLabel: "Your title",
    designationPlaceholder: "e.g. Training & Placement Officer",
  },
  {
    value: "MENTOR",
    label: "Mentor",
    hint: "Guide students who need support",
    icon: HeartHandshake,
    emailLabel: "Official email",
    designationLabel: "Your title",
    designationPlaceholder: "e.g. Assistant Professor, CSE",
  },
];

const EMPTY_FORM = { fullName: "", email: "", password: "", organization: "", designation: "" };
const EMPTY_COLLEGE = { name: "", city: "", state: "" };

function SignUp() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [role, setRole] = useState("STUDENT");
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [college, setCollege] = useState(null);
  const [addingCollege, setAddingCollege] = useState(false);
  const [newCollege, setNewCollege] = useState(EMPTY_COLLEGE);
  const [states, setStates] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const config = ROLES.find((r) => r.value === role);
  const isStudent = role === "STUDENT";
  const isRecruiter = role === "RECRUITER";
  const isStaff = role === "PLACEMENT_OFFICER" || role === "MENTOR";

  useEffect(() => {
    if (!addingCollege || states.length) return;
    api
      .get("/colleges/states")
      .then((res) => setStates(res.data ?? []))
      .catch(() => {});
  }, [addingCollege, states.length]);

  const chooseRole = (value) => {
    setRole(value);
    setErrors({});
    setFormData((prev) => ({ ...prev, organization: "", designation: "" }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "", submit: "" }));
  };

  const handleCollegeField = (e) => {
    const { name, value } = e.target;
    setNewCollege((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [`college_${name}`]: "", submit: "" }));
  };

  const startAddCollege = (name) => {
    setCollege(null);
    setAddingCollege(true);
    setNewCollege({ ...EMPTY_COLLEGE, name });
    setErrors((prev) => ({ ...prev, college: "" }));
  };

  const validate = () => {
    const next = {};
    if (!formData.fullName.trim()) next.fullName = "Enter your full name";
    if (!formData.email.trim()) next.email = "Enter your email address";
    else if (!EMAIL_PATTERN.test(formData.email)) next.email = "That doesn't look like a valid email address";
    const pw = passwordProblem(formData.password);
    if (pw) next.password = pw;

    if (isRecruiter) {
      if (!formData.organization.trim()) next.organization = "Enter your company name";
    } else if (addingCollege) {
      if (newCollege.name.trim().length < 3) next.college_name = "Enter the college's full name";
      if (newCollege.city.trim().length < 2) next.college_city = "Enter the city";
      if (!newCollege.state) next.college_state = "Choose the state";
    } else if (!college) {
      next.college = "Choose your college";
    }

    if (isStudent && !formData.designation) next.designation = "Choose your branch";
    if (isRecruiter && !formData.designation.trim()) next.designation = "Enter your title";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      fullName: formData.fullName.trim(),
      email: formData.email.trim(),
      password: formData.password,
      role,
    };
    if (formData.designation.trim()) payload.designation = formData.designation.trim();
    if (isRecruiter) {
      payload.organization = formData.organization.trim();
    } else if (addingCollege) {
      payload.newCollege = {
        name: newCollege.name.trim(),
        city: newCollege.city.trim(),
        state: newCollege.state,
      };
    } else {
      payload.collegeId = college.id;
    }

    setSubmitting(true);
    try {
      const user = await register(payload);
      navigate(ROLE_HOME[user.role] || "/");
    } catch (err) {
      setErrors({ submit: err.message || "Could not create your account" });
    } finally {
      setSubmitting(false);
    }
  };

  const fieldProps = (name) => ({
    id: `signup-${name}`,
    name,
    value: formData[name],
    onChange: handleChange,
    className: errors[name] ? "input-error" : "",
    "aria-invalid": Boolean(errors[name]),
  });

  const collegeProps = (name) => ({
    id: `signup-college-${name}`,
    name,
    value: newCollege[name],
    onChange: handleCollegeField,
    className: errors[`college_${name}`] ? "input-error" : "",
    "aria-invalid": Boolean(errors[`college_${name}`]),
  });

  return (
    <AuthLayout>
      <div className="auth-card auth-card-wide">
        <h1>Create your account</h1>
        <p>Choose the workspace that matches your role.</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="role-options role-options-4" role="radiogroup" aria-label="Account type">
            {ROLES.map(({ value, label, hint, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={role === value}
                className="role-option"
                onClick={() => chooseRole(value)}
              >
                <Icon aria-hidden="true" />
                <strong>{label}</strong>
                <span>{hint}</span>
              </button>
            ))}
          </div>

          {errors.submit && <Alert tone="error">{errors.submit}</Alert>}

          <div className="field">
            <label htmlFor="signup-fullName">Full name</label>
            <input {...fieldProps("fullName")} autoComplete="name" placeholder="As on your ID card" />
            {errors.fullName && <span className="field-error">{errors.fullName}</span>}
          </div>

          <div className="field">
            <label htmlFor="signup-email">{config.emailLabel}</label>
            <input {...fieldProps("email")} type="email" autoComplete="email" placeholder="name@example.com" />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="field">
            <label htmlFor="signup-password">Password</label>
            <PasswordInput {...fieldProps("password")} autoComplete="new-password" />
            {errors.password ? (
              <span className="field-error">{errors.password}</span>
            ) : (
              <span className="field-hint">At least 8 characters, with a letter and a number.</span>
            )}
          </div>

          {isRecruiter ? (
            <div className="field">
              <label htmlFor="signup-organization">Company</label>
              <input {...fieldProps("organization")} placeholder="e.g. Acme Technologies" />
              {errors.organization && <span className="field-error">{errors.organization}</span>}
            </div>
          ) : addingCollege ? (
            <fieldset className="college-new">
              <legend>Add your college</legend>
              <p className="field-hint">
                It will be listed right away and checked by the CampusLink team.
              </p>
              <div className="field">
                <label htmlFor="signup-college-name">College name</label>
                <input {...collegeProps("name")} placeholder="Full official name" />
                {errors.college_name && <span className="field-error">{errors.college_name}</span>}
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="signup-college-city">City</label>
                  <input {...collegeProps("city")} placeholder="e.g. Nashik" />
                  {errors.college_city && <span className="field-error">{errors.college_city}</span>}
                </div>
                <div className="field">
                  <label htmlFor="signup-college-state">State or UT</label>
                  <select {...collegeProps("state")}>
                    <option value="">Select</option>
                    {states.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {errors.college_state && <span className="field-error">{errors.college_state}</span>}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setAddingCollege(false);
                  setNewCollege(EMPTY_COLLEGE);
                }}
              >
                Search the list instead
              </button>
            </fieldset>
          ) : (
            <div className="field">
              <label htmlFor="signup-college">College</label>
              <CollegePicker
                id="signup-college"
                value={college}
                onChange={(c) => {
                  setCollege(c);
                  setErrors((prev) => ({ ...prev, college: "", submit: "" }));
                }}
                onAddNew={startAddCollege}
                invalid={Boolean(errors.college)}
              />
              {errors.college ? (
                <span className="field-error">{errors.college}</span>
              ) : (
                <span className="field-hint">
                  {isStaff
                    ? "Your college's placement office approves new staff accounts."
                    : "Search from colleges across India."}
                </span>
              )}
            </div>
          )}

          <div className="field">
            <label htmlFor="signup-designation">
              {config.designationLabel}
              {isStaff && <span className="label-optional"> (optional)</span>}
            </label>
            {isStudent ? (
              <select {...fieldProps("designation")}>
                <option value="">Select branch</option>
                {BRANCHES.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.code} · {b.label}
                  </option>
                ))}
              </select>
            ) : (
              <input {...fieldProps("designation")} placeholder={config.designationPlaceholder} />
            )}
            {errors.designation && <span className="field-error">{errors.designation}</span>}
          </div>

          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
            {submitting && <Spinner />}
            {submitting ? "Creating account" : "Create account"}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </AuthLayout>
  );
}

export default SignUp;
