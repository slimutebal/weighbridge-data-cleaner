const INVISIBLE_CHARS = new RegExp("[\\u00A0\\uFEFF\\u200B]", "g");

// Trailing "DT" suffix in any spacing/punctuation form: " DT", "-DT", ".DT",
// "DT.", or a bare trailing "DT" with nothing between it and the rest of
// the id. \b before DT prevents this from matching a DT that's merely the
// tail of a longer token (e.g. it will not touch "...XDT" with no
// separator). An optional trailing "." after DT (e.g. "SCM-LIM 221 DT.")
// is also consumed.
const TRAILING_DT_SUFFIX = /[\s.-]*\bDT\.?\s*$/;
const TRAILING_PUNCTUATION = /[.\-\s]+$/;
const SCM_UNIT_PATTERN = /^SCM[\s-]+([A-Z]+)[\s-]+(\d+[A-Z]*)$/;

// Shared first pass for any DT id, used by both the matching key
// (normalizeDtId) and the canonical master display format
// (toCanonicalDtId) below: uppercase, trim, strip invisible characters,
// normalize underscore separators, remove a trailing "DT" suffix in
// whatever form it was separated, then clean up anything left dangling.
function cleanDtIdBase(value) {
  if (value === undefined || value === null) return "";

  let base = String(value).replace(INVISIBLE_CHARS, " ").trim().toUpperCase();
  base = base.replace(/_/g, " ");
  base = base.replace(TRAILING_DT_SUFFIX, "").trim();
  base = base.replace(TRAILING_PUNCTUATION, "").trim();
  base = base.replace(/\s+/g, " ");

  return base;
}

// Matching/join key only — never for display. Fully punctuation-free so
// "SCM-LIM 221", "SCM LIM 221", and "SCM-LIM 221 DT." all collapse to the
// same key ("SCMLIM221"), which is what keeps List DT joins and duplicate
// detection working regardless of how a given source spells its
// separators or suffix.
export function normalizeDtId(value) {
  return cleanDtIdBase(value).replace(/[\s-]/g, "");
}

// Canonical master DT id for display and for anything written back out
// (Unmatched DT Correction table, local List DT cache, pending sync queue,
// Google Sheet POST payload) — see README.md "Canonical List DT format".
// Only SCM-prefixed ids are restructured into "SCM-<UNIT> <NUMBER>"; any
// other format (e.g. non-SCM fleet ids) is returned with the same base
// clean-up (trimmed, uppercase, DT suffix removed) but without forcing an
// SCM-shaped separator pattern onto it.
export function toCanonicalDtId(value) {
  const base = cleanDtIdBase(value);
  const match = base.match(SCM_UNIT_PATTERN);
  if (!match) return base;

  const [, unit, number] = match;
  return `SCM-${unit} ${number}`;
}

export function cleanPileId(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(INVISIBLE_CHARS, " ").trim();
}

// HYNC-only (v1.0.1-predeploy). Source SCHY PILE IDs spell the hyphen
// between SCHY/EX/number inconsistently ("SCHY02687", "SCHY 02687",
// "SCHY-02687" all appear); this canonicalizes all of them to the
// SCHY-<number> / SCHY-EX-<number> form. Only ever called from
// js/profiles/hync/cleaner.js — SLNC (SCSL) and ESG PILE IDs are already
// legacy-compatible and must never pass through this function. Anything
// that doesn't match the expected SCHY[-EX]-<digits> shape is returned
// unchanged (trimmed only) rather than forced into the pattern, so it
// can never mangle an unrelated/malformed value. The numeric part is
// captured and reused verbatim, so leading zeroes are never stripped.
const HYNC_PILE_ID_PATTERN = /^SCHY[\s-]*(EX)?[\s-]*(\d+)$/i;

export function canonicalizeHyncPileId(value) {
  const trimmed = (value === undefined || value === null ? "" : String(value)).trim();
  const match = trimmed.match(HYNC_PILE_ID_PATTERN);
  if (!match) return trimmed;

  const [, ex, number] = match;
  return ex ? `SCHY-EX-${number}` : `SCHY-${number}`;
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
