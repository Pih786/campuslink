export function initials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

export function relativeTime(value) {
  if (!value) return "—";
  const diffMs = Date.now() - new Date(value).getTime();
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);

  let label;
  if (minutes < 1) label = "just now";
  else if (minutes < 60) label = `${minutes}m`;
  else if (hours < 24) label = `${hours}h`;
  else label = `${days}d`;

  if (label === "just now") return label;
  return future ? `in ${label}` : `${label} ago`;
}

export function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function dayLabel(value) {
  const date = new Date(value);
  const today = new Date();
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(date) - startOf(today)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}

// <input type="datetime-local"> needs "YYYY-MM-DDTHH:mm" in LOCAL time.
export function toLocalInputValue(value) {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function formatLpa(ctcPerYear) {
  if (ctcPerYear == null) return "—";
  return `₹${(ctcPerYear / 100000).toFixed(1)} LPA`;
}

function lakhs(value) {
  const l = value / 100000;
  return Number.isInteger(l) ? String(l) : l.toFixed(1);
}

export function formatSalaryRange(min, max) {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `₹${lakhs(min)}–${lakhs(max)} LPA`;
  return `₹${lakhs(max ?? min)} LPA`;
}

const EMPLOYMENT_LABELS = {
  FULL_TIME: "Full-time",
  INTERNSHIP: "Internship",
  CONTRACT: "Contract",
};

export function employmentLabel(value) {
  return EMPLOYMENT_LABELS[value] ?? null;
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function firstName(fullName) {
  return fullName?.trim().split(/\s+/)[0] ?? "";
}
