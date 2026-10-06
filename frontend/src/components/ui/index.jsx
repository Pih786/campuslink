import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, XCircle } from "lucide-react";
import { initials } from "../../lib/format";
import { statusInfo } from "../../lib/status";

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        {back && (
          <Link className="back-link" to={back.to}>
            <ArrowLeft size={14} aria-hidden="true" />
            {back.label}
          </Link>
        )}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Card({ title, subtitle, actions, flush = false, className = "", children }) {
  const hasHeader = title || actions;
  return (
    <section className={`card ${flush ? "card-flush" : ""} ${className}`.trim()}>
      {hasHeader && (
        <div className="card-header">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, meta, icon: Icon, tone, progress }) {
  return (
    <div className={`stat ${tone === "success" ? "stat-success" : ""}`}>
      <span className="stat-label">
        {Icon && <Icon aria-hidden="true" />}
        {label}
      </span>
      <span className="stat-value">{value}</span>
      {progress != null && (
        <div className="progress" aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
      {meta && <span className="stat-meta">{meta}</span>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action, compact = false }) {
  return (
    <div className={`empty ${compact ? "empty-compact" : ""}`}>
      {Icon && (
        <div className="empty-icon">
          <Icon aria-hidden="true" />
        </div>
      )}
      {title && <p className="empty-title">{title}</p>}
      {children && <p className="empty-text">{children}</p>}
      {action}
    </div>
  );
}

const ALERT_ICONS = {
  error: XCircle,
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
};

export function Alert({ tone = "info", title, children }) {
  const Icon = ALERT_ICONS[tone] ?? Info;
  return (
    <div className={`alert alert-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon aria-hidden="true" />
      <div className="alert-body">
        {title && <strong>{title}</strong>}
        {children && (title ? <p>{children}</p> : children)}
      </div>
    </div>
  );
}

export function Badge({ tone = "neutral", plain = false, children }) {
  const toneClass = tone === "neutral" ? "" : `badge-${tone}`;
  return <span className={`badge ${toneClass} ${plain ? "badge-plain" : ""}`.trim()}>{children}</span>;
}

export function StatusBadge({ kind, value }) {
  const { label, tone } = statusInfo(kind, value);
  return <Badge tone={tone}>{label}</Badge>;
}

export function Avatar({ name, size }) {
  return (
    <span className={`avatar ${size ? `avatar-${size}` : ""}`.trim()} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function PageSkeleton({ stats = 0, cards = 2 }) {
  return (
    <div className="page" aria-busy="true" aria-label="Loading">
      <div className="skeleton skeleton-title" />
      {stats > 0 && (
        <div className="stat-grid">
          {Array.from({ length: stats }, (_, i) => (
            <div key={i} className="skeleton skeleton-stat" />
          ))}
        </div>
      )}
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="skeleton skeleton-card" />
      ))}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}
