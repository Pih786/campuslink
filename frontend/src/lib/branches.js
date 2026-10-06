// Branch codes must match the eligibility engine (exact, case-insensitive
// compare) and the JD analyzer's normalised codes.
export const BRANCHES = [
  { code: "CSE", label: "Computer Science" },
  { code: "IT", label: "Information Technology" },
  { code: "ECE", label: "Electronics & Communication" },
  { code: "EEE", label: "Electrical & Electronics" },
  { code: "ME", label: "Mechanical" },
  { code: "Civil", label: "Civil" },
  { code: "MCA", label: "Computer Applications (MCA)" },
];

export function branchLabel(code) {
  const match = BRANCHES.find((b) => b.code.toLowerCase() === String(code ?? "").toLowerCase());
  return match ? `${match.code} · ${match.label}` : code;
}
