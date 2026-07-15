export function computeGroupValidation(group) {
  const rows = group.rows;

  const tonnage = rows.reduce((sum, row) => sum + (Number(row.Net) || 0), 0);

  const notaCounts = new Map();
  rows.forEach((row) => {
    const nota = row["NO.NOTA"];
    notaCounts.set(nota, (notaCounts.get(nota) || 0) + 1);
  });
  const duplicateNotaRows = rows.filter((row) => notaCounts.get(row["NO.NOTA"]) > 1);

  const missingContractorRows = rows.filter((row) => row.Contractor === "Unmatched");
  const missingSourceRows = rows.filter((row) => !row.Source);
  const missingGradeRows = rows.filter((row) => !row.Grade);

  // Row-level detected shift (IV-1) is preserved per row in _detectedShift
  // (clean output Shift is always the declared bucket, v0.2 pilot fix); rows
  // whose detected shift differs from the group's declared bucket are
  // surfaced as a warning here rather than split into a separate copy group
  // (see DECISIONS.md).
  const shiftWarningRows = rows.filter((row) => row._detectedShift !== group.bucket);

  // PILE ID integrity (v0.2.0-prepilot): within one operational group, a
  // single PILE ID must resolve to exactly one Source. A Source mapping to
  // several PILE IDs is normal and not flagged. Blank PILE ID / blank Source
  // rows are excluded here — those are already covered by the missing-field
  // counts above.
  const sourcesByPileId = new Map();
  rows.forEach((row) => {
    const pileId = row["PILE ID"];
    const source = row.Source;
    if (!pileId || !source) return;
    if (!sourcesByPileId.has(pileId)) sourcesByPileId.set(pileId, new Set());
    sourcesByPileId.get(pileId).add(source);
  });
  const conflictingPileIds = Array.from(sourcesByPileId.entries())
    .filter(([, sources]) => sources.size > 1)
    .map(([pileId]) => pileId);
  const conflictingPileIdSet = new Set(conflictingPileIds);
  const pileIdSourceConflictRows = rows.filter((row) =>
    conflictingPileIdSet.has(row["PILE ID"])
  );

  // ESG's "lost rows" bucket (group.lostRowsCount, populated by
  // esg/cleaner.js) is a row within a repeated report block that looked
  // like a detail row (ticket id + numeric net) but had no parseable
  // timestamp. Across validated ESG samples this is always the block's
  // header/subtotal/summary row, not a discarded hauling record — raw
  // sheet rows equal clean rows and tonnage matches. Report it as an
  // informational structural count (esgReportGroups) instead of a
  // blocking Lost Rows issue. HYNC/SLNC have no repeated-block structure
  // and keep the original blocking lostRowCount unchanged.
  const isEsg = group.profile === "ESG";
  const structuralRowCount = group.lostRowsCount || 0;
  const cleanRowCount = rows.length;
  const lostRowCount = isEsg ? 0 : structuralRowCount;
  // Raw rows = every candidate source row this file offered for this group:
  // rows that were emitted plus rows that were genuine detail-row
  // candidates but failed validation (lostRowCount). Rows that never looked
  // like detail data at all (blank padding rows from the sheet's used
  // range, ESG template/subtotal rows) are not candidates and are excluded
  // from both counts — see isRowBlank() in schema-detector.js and the
  // skippedRows handling in the HYNC/SLNC/ESG cleaners. This keeps
  // 0 <= lostRowCount <= rawRowCount an actual invariant instead of two
  // counters that can silently drift apart.
  const rawRowCount = cleanRowCount + lostRowCount;

  return {
    rawRowCount,
    cleanRowCount,
    lostRowCount,
    lostRowDetails: isEsg ? [] : group.lostRowsDetail || [],
    esgReportGroups: isEsg ? structuralRowCount : 0,
    rawTonnage: tonnage,
    cleanTonnage: tonnage,
    tonnageDifference: 0,
    duplicateNotaCount: duplicateNotaRows.length,
    duplicateNotaRows,
    missingContractorCount: missingContractorRows.length,
    missingContractorRows,
    missingSourceCount: missingSourceRows.length,
    missingSourceRows,
    missingGradeCount: missingGradeRows.length,
    missingGradeRows,
    unmatchedDtCount: missingContractorRows.length,
    unmatchedDtRows: missingContractorRows,
    shiftWarningCount: shiftWarningRows.length,
    shiftWarningRows,
    conflictingPileIds,
    pileIdSourceConflictCount: conflictingPileIds.length,
    pileIdSourceConflictRows,
  };
}
