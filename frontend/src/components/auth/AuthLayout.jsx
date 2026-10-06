import { useState } from "react";
import { CircleCheck, Eye, EyeOff } from "lucide-react";
import Logo from "../common/Logo";
import ThemeToggle from "../common/ThemeToggle";

const POINTS = [
  { title: "Eligibility you can see", text: "Know exactly which criteria a role checks before you apply." },
  { title: "Scores with reasons", text: "Every match shows the skills that counted and the gaps that didn't." },
  { title: "One record for everyone", text: "Students, recruiters and the placement office work from the same data." },
];

export function AuthLayout({ children }) {
  return (
    <div className="auth">
      <aside className="auth-aside">
        <Logo />
        <div className="auth-aside-body">
          <h2>Campus placements, without the spreadsheets.</h2>
          <ul>
            {POINTS.map((point) => (
              <li key={point.title}>
                <CircleCheck aria-hidden="true" />
                <div>
                  <strong>{point.title}</strong>
                  <span>{point.text}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="auth-aside-foot">© {new Date().getFullYear()} CampusLink</p>
      </aside>

      <main className="auth-main">
        <div className="auth-mobile-brand">
          <Logo />
        </div>
        <div className="auth-theme">
          <ThemeToggle />
        </div>
        {children}
      </main>
    </div>
  );
}

export function PasswordInput({ className = "", ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <input {...props} className={className} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}
