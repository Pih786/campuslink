import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import Logo from "../common/Logo";
import { Avatar } from "../ui";
import { NotificationBell, useNotifications } from "./Notifications";

function userSubtitle(user) {
  if (!user) return "";
  if (user.role === "STUDENT") return [user.department, user.collegeName].filter(Boolean).join(" · ") || user.email;
  if (user.role === "RECRUITER") return user.companyName || user.email;
  if (user.role === "ADMIN") return "Platform admin";
  return user.collegeName || user.email;
}

// navByRole lets one route group show a different menu to, e.g., admins.
function AppShell({ nav: defaultNav, navByRole }) {
  const { user, logout } = useAuth();
  const nav = navByRole?.[user?.role] ?? defaultNav;
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const notifications = useNotifications();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const home = nav.sections[0].links[0].to;

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Main navigation">
        <div className="sidebar-brand">
          <Logo to={home} />
          <NotificationBell state={notifications} placement="sidebar" />
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm sidebar-close"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X />
          </button>
        </div>

        <div className="sidebar-portal">
          Workspace
          <strong>{nav.portal}</strong>
        </div>

        <nav className="sidebar-nav">
          {nav.sections.map((section) => (
            <div key={section.label} className="nav-section">
              <div className="nav-section-label">{section.label}</div>
              {section.links.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} onClick={() => setOpen(false)} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <Avatar name={user?.fullName} />
            <div className="user-card-text">
              <strong>{user?.fullName}</strong>
              <span>{userSubtitle(user)}</span>
            </div>
          </div>
          <div className="sidebar-actions">
            <button type="button" className="btn btn-ghost" onClick={toggle}>
              {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={logout}>
              <LogOut aria-hidden="true" />
              Log out
            </button>
          </div>
        </div>
      </aside>

      <div className={`shell-backdrop ${open ? "open" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />

      <div className="shell-main">
        <header className="mobile-bar">
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
          >
            <Menu />
          </button>
          <Logo to={home} />
          <NotificationBell state={notifications} placement="mobile" />
        </header>

        <main className="shell-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppShell;
