// Mirrors the backend rule in auth.validators.ts.
export function passwordProblem(value) {
  if (!value) return "Choose a password";
  if (value.length < 8) return "Use at least 8 characters";
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return "Use at least one letter and one number";
  return "";
}
