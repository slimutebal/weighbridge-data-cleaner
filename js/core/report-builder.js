function summarizeBy(rows, key) {
  const map = new Map();

  rows.forEach((row) => {
    const groupKey = row[key] || "(blank)";
    if (!map.has(groupKey)) {
      map.set(groupKey, { key: groupKey, rowCount: 0, netTotal: 0 });
    }
    const entry = map.get(groupKey);
    entry.rowCount += 1;
    entry.netTotal += Number(row.Net) || 0;
  });

  return Array.from(map.values()).sort((a, b) => b.netTotal - a.netTotal);
}

export function buildGroupSummary(group) {
  const rows = group.rows;
  return {
    byContractor: summarizeBy(rows, "Contractor"),
    byPileId: summarizeBy(rows, "PILE ID"),
    bySource: summarizeBy(rows, "Source"),
    byGrade: summarizeBy(rows, "Grade"),
  };
}
