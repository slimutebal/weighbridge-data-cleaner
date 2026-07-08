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
  };
}
