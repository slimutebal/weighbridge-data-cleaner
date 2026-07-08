const INVISIBLE_CHARS = new RegExp("[\\u00A0\\uFEFF\\u200B]", "g");

// Master DT display/matching format (v0.2.0-prepilot rev2): separators are
// normalized to spaces BEFORE the trailing "DT" suffix is stripped, so
// "SCM-LIM-992-DT" and "SCM LIM 992 DT" both resolve to "SCM LIM 992" —
// stripping the suffix first (the previous order) missed the hyphenated
// case because "-DT" has no whitespace before "DT" to match against.
export function normalizeDtId(value) {
  if (value === undefined || value === null) return "";

  let normalized = String(value).replace(INVISIBLE_CHARS, " ").trim().toUpperCase();

  normalized = normalized.replace(/-/g, " ");
  normalized = normalized.replace(/\s+/g, " ").trim();
  normalized = normalized.replace(/\s+DT$/, "");
  normalized = normalized.trim();

  return normalized;
}

export function cleanPileId(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(INVISIBLE_CHARS, " ").trim();
}

export function parseSourceGrade(value) {
  const trimmed = value === undefined || value === null ? "" : String(value).trim();
  if (!trimmed) return { source: "", grade: "" };

  const openIndex = trimmed.indexOf("(");
  if (openIndex === -1) {
    return { source: trimmed, grade: "" };
  }

  const source = trimmed.slice(0, openIndex).trim();
  const closeIndex = trimmed.lastIndexOf(")");
  const gradeRaw =
    closeIndex > openIndex ? trimmed.slice(openIndex + 1, closeIndex) : trimmed.slice(openIndex + 1);

  return { source, grade: gradeRaw.trim() };
}

export function deriveType(pileId) {
  const value = (pileId || "").toUpperCase();
  return value.includes("EX") ? "EXW" : "DAP";
}

export function deriveBuyerHyncSlnc(pileId) {
  const value = (pileId || "").toUpperCase();
  return value.includes("HY") ? "HYNC" : "SLNC";
}

export function deriveBuyerEsg(pileId) {
  const value = (pileId || "").toUpperCase();
  if (value.includes("HY")) return "HYNC";
  if (value.includes("ESG")) return "ESG";
  if (value.includes("MEIM")) return "MEIM";
  if (value.includes("QMB")) return "QMB";
  return "ESG";
}
