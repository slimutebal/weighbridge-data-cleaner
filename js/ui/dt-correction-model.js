// Pure, DOM-free data shaping for the Unmatched DT / New Unit contextual
// correction workflow (UI-5C, design spec §12). Consumes only rows already
// produced by the profile cleaners / validation-engine.js — the canonical
// DT id (row["NO. DT"], via toCanonicalDtId() in js/core/normalizers.js)
// and matching/duplicate/conflict classification (js/core/list-dt-manager.js)
// are reused exactly as-is; this module invents no new normalization or
// matching logic of its own. Kept dependency-free (no DOM, no i18n) so the
// consolidation logic can be unit-tested without a browser environment —
// see tests/dt-correction.test.mjs.

// Groups already-unmatched clean rows (row.Contractor === "Unmatched",
// row["NO. DT"] already the canonical master DT id) by that canonical id,
// so the operator sees one correction record per unique truck instead of
// one contractor input per affected source row (spec §5). Multiple PILE
// IDs / Source values for the same DT are preserved as full sets, never
// collapsed to a single silently-picked value (spec §7).
export function buildUniqueDtCorrections(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const dtId = row["NO. DT"];
    if (!dtId) return;
    if (!map.has(dtId)) {
      map.set(dtId, { dtId, rawDtIds: new Set(), pileIds: new Set(), sources: new Set(), rows: [] });
    }
    const entry = map.get(dtId);
    if (row._rawDtId) entry.rawDtIds.add(String(row._rawDtId));
    if (row["PILE ID"]) entry.pileIds.add(String(row["PILE ID"]));
    if (row.Source) entry.sources.add(String(row.Source));
    entry.rows.push(row);
  });

  // Highest-affected-row-count first, so the most operationally significant
  // unmatched unit is the first thing the operator sees.
  return Array.from(map.values())
    .map((entry) => ({
      dtId: entry.dtId,
      rawDtIds: Array.from(entry.rawDtIds),
      pileIds: Array.from(entry.pileIds),
      sources: Array.from(entry.sources),
      rows: entry.rows,
    }))
    .sort((a, b) => b.rows.length - a.rows.length);
}

// "value, +N more" compact presentation for a PILE ID/Source list that may
// hold more than one value for the same normalized DT (spec §7) — the full
// list is always still returned as `title` for a tooltip/aria-label, never
// silently dropped. `moreLabel` is a (count) => string callback so this
// module stays i18n-agnostic; callers pass a translated label.
export function compactValueList(values, moreLabel) {
  if (!values.length) return { text: "—", title: "" };
  if (values.length === 1) return { text: values[0], title: "" };
  return {
    text: `${values[0]} ${moreLabel(values.length - 1)}`,
    title: values.join(", "),
  };
}
