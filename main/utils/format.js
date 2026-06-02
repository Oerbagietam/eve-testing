export function combineBranches(branchFront, branchBack) {
  const front = (branchFront || "").trim();
  const back = (branchBack || "").trim();
  if (front && back) return `${front} | ${back}`;
  return front || back || "";
}

export function formatBranches(test) {
  if (!test) return "";
  const front = (test.branchFront || "").trim();
  const back = (test.branchBack || "").trim();
  if (front && back) return `Front: ${front} | Back: ${back}`;
  if (front) return `Front: ${front}`;
  if (back) return `Back: ${back}`;
  return (test.branch || "").trim();
}

export function normalizeValue(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}
