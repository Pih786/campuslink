export const STAGES = [
  { key: "applied", label: "Applied", statuses: ["APPLIED", "ELIGIBLE"], color: "var(--stage-applied)" },
  { key: "shortlisted", label: "Shortlisted", statuses: ["SHORTLISTED", "ASSESSMENT"], color: "var(--stage-shortlisted)" },
  { key: "interview", label: "Interview", statuses: ["INTERVIEW"], color: "var(--stage-interview)" },
  { key: "selected", label: "Selected", statuses: ["SELECTED"], color: "var(--stage-selected)" },
  { key: "offered", label: "Offered", statuses: ["OFFERED"], color: "var(--stage-offered)" },
  { key: "accepted", label: "Accepted", statuses: ["ACCEPTED"], color: "var(--stage-accepted)" },
  { key: "joined", label: "Joined", statuses: ["JOINED"], color: "var(--stage-joined)" },
  { key: "closed", label: "Rejected / Declined", statuses: ["REJECTED", "DECLINED"], color: "var(--stage-closed)" },
];

export function stageForStatus(status) {
  return STAGES.find((s) => s.statuses.includes(status)) ?? STAGES[0];
}

// Mirrors backend applications.service isValidStatusTransition so the UI
// can reject impossible drags instantly instead of round-tripping a 400.
const STATUS_RANK = {
  APPLIED: 0,
  ELIGIBLE: 1,
  SHORTLISTED: 2,
  ASSESSMENT: 3,
  INTERVIEW: 4,
  SELECTED: 5,
  OFFERED: 6,
  ACCEPTED: 7,
  JOINED: 8,
  REJECTED: 99,
  DECLINED: 99,
};

const TERMINAL = ["JOINED", "REJECTED", "DECLINED"];

export function canTransition(current, next) {
  if (current === next) return false;
  if (TERMINAL.includes(current)) return false;
  if (next === "REJECTED" || next === "DECLINED") return true;
  return STATUS_RANK[next] > STATUS_RANK[current];
}

// What dropping a card onto a column means. `modal` stages need extra input
// (interview time / offer terms) before anything is sent to the API.
export const DROP_ACTIONS = {
  shortlisted: { type: "status", status: "SHORTLISTED" },
  interview: { type: "modal", modal: "interview", status: "INTERVIEW" },
  selected: { type: "status", status: "SELECTED" },
  offered: { type: "modal", modal: "offer", status: "OFFERED" },
  closed: { type: "status", status: "REJECTED" },
};
