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

  // Row-level detected shift (IV-1) is preserved per row; rows whose detected
  // shift differs from the group's declared bucket are surfaced as a warning
  // here rather than split into a separate copy group (see DECISIONS.md).
  const shiftWarningRows = rows.filter((row) => row.Shift !== group.bucket);

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

  return {
    rawRowCount: rows.length,
    cleanRowCount: rows.length,
    lostRowCount: 0,
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
