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

// Main operator-facing summary (v0.2.0-prepilot): one row per PILE ID +
// Source + Contractor combination, with a Remark column calling out
// operational issues on that combination rather than requiring the operator
// to cross-reference separate issue tables.
function buildOperationalSummary(rows, conflictingPileIds) {
  const conflictSet = new Set(conflictingPileIds || []);
  const map = new Map();

  rows.forEach((row) => {
    const pileId = row["PILE ID"] || "";
    const source = row.Source || "";
    const contractor = row.Contractor || "";
    const key = pileId + "|" + source + "|" + contractor;
    if (!map.has(key)) {
      map.set(key, { pileId, source, contractor, rowCount: 0, netTotal: 0, missingGrade: false });
    }
    const entry = map.get(key);
    entry.rowCount += 1;
    entry.netTotal += Number(row.Net) || 0;
    if (!row.Grade) entry.missingGrade = true;
  });

  return Array.from(map.values())
    .map((entry) => {
      const remarks = [];
      if (entry.contractor === "Unmatched") remarks.push("Unknown DT");
      if (!entry.source) remarks.push("Missing Source");
      if (entry.missingGrade) remarks.push("Missing Grade");
      if (!entry.pileId) remarks.push("Missing PILE ID");
      if (entry.pileId && conflictSet.has(entry.pileId)) remarks.push("PILE ID has multiple Sources");
      return { ...entry, remark: remarks.join("; ") };
    })
    .sort((a, b) => b.netTotal - a.netTotal);
}

export function buildGroupSummary(group, validation) {
  const rows = group.rows;
  return {
    operational: buildOperationalSummary(rows, validation && validation.conflictingPileIds),
    byContractor: summarizeBy(rows, "Contractor"),
    byPileId: summarizeBy(rows, "PILE ID"),
    bySource: summarizeBy(rows, "Source"),
    byGrade: summarizeBy(rows, "Grade"),
  };
}
