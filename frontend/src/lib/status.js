// One place for how every workflow status is labelled and coloured.
// tone -> badge-{tone}; "neutral" uses the plain badge.

const APPLICATION = {
  APPLIED: { label: "Applied", tone: "neutral" },
  ELIGIBLE: { label: "Eligible", tone: "neutral" },
  SHORTLISTED: { label: "Shortlisted", tone: "brand" },
  ASSESSMENT: { label: "Assessment", tone: "brand" },
  INTERVIEW: { label: "Interview", tone: "brand" },
  SELECTED: { label: "Selected", tone: "success" },
  OFFERED: { label: "Offered", tone: "success" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  JOINED: { label: "Joined", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  DECLINED: { label: "Declined", tone: "danger" },
};

const INTERVIEW = {
  SCHEDULED: { label: "Scheduled", tone: "brand" },
  RESCHEDULED: { label: "Rescheduled", tone: "brand" },
  COMPLETED: { label: "Completed", tone: "success" },
  NO_SHOW: { label: "No-show", tone: "warning" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

const OFFER = {
  PENDING: { label: "Awaiting response", tone: "warning" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  DECLINED: { label: "Declined", tone: "danger" },
  DEFERRED: { label: "Deferred", tone: "brand" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
};

const OFFER_TYPE = {
  FULL_TIME: { label: "Full-time", tone: "neutral" },
  INTERNSHIP: { label: "Internship", tone: "brand" },
  PPO: { label: "Pre-placement offer", tone: "success" },
};

const CONVERSION = {
  PENDING: { label: "Conversion pending", tone: "neutral" },
  CONVERTED: { label: "Converted to PPO", tone: "success" },
  NOT_CONVERTED: { label: "Not converted", tone: "neutral" },
};

const DOCUMENT = {
  REQUIRED: { label: "Not submitted", tone: "neutral" },
  SUBMITTED: { label: "Awaiting review", tone: "warning" },
  VERIFIED: { label: "Verified", tone: "success" },
  REJECTED: { label: "Resubmit", tone: "danger" },
};

const JOINING = {
  PENDING: { label: "Joining pending", tone: "neutral" },
  JOINED: { label: "Joined", tone: "success" },
  DID_NOT_JOIN: { label: "Did not join", tone: "warning" },
};

const JOB = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PUBLISHED: { label: "Open", tone: "success" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

const DRIVE = {
  SCHEDULED: { label: "Scheduled", tone: "brand" },
  COMPLETED: { label: "Completed", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
};

const COMPANY = {
  ACTIVE: { label: "Active", tone: "success" },
  INACTIVE: { label: "Inactive", tone: "neutral" },
};

const DIFFICULTY = {
  EASY: { label: "Easy", tone: "success" },
  MEDIUM: { label: "Medium", tone: "warning" },
  HARD: { label: "Hard", tone: "danger" },
};

// TRD §31 readiness bands.
const READINESS = {
  "Highly Employable": { label: "Highly employable", tone: "success" },
  Ready: { label: "Ready", tone: "brand" },
  Developing: { label: "Developing", tone: "warning" },
  "Not Ready": { label: "Not ready", tone: "neutral" },
};

export const STATUS_MAPS = {
  readiness: READINESS,
  offerType: OFFER_TYPE,
  conversion: CONVERSION,
  document: DOCUMENT,
  application: APPLICATION,
  interview: INTERVIEW,
  offer: OFFER,
  joining: JOINING,
  job: JOB,
  drive: DRIVE,
  company: COMPANY,
  difficulty: DIFFICULTY,
};

function humanize(value) {
  if (!value) return "—";
  const text = String(value).replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function statusInfo(kind, value) {
  return STATUS_MAPS[kind]?.[value] ?? { label: humanize(value), tone: "neutral" };
}
