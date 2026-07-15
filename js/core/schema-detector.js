function normalizeCell(value) {
  return String(value ?? "").trim();
}

export function findHeaderRowIndex(rows, requiredHeaders, options = {}) {
  const { fromIndex = 0, maxScan = rows.length } = options;
  const endIndex = Math.min(rows.length, fromIndex + maxScan);

  for (let i = fromIndex; i < endIndex; i++) {
    const row = rows[i] || [];
    const cellSet = new Set(row.map(normalizeCell));
    const matchesAll = requiredHeaders.every((header) => cellSet.has(header));
    if (matchesAll) return i;
  }

  return -1;
}

export function findAllHeaderRowIndices(rows, requiredHeaders) {
  const indices = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const cellSet = new Set(row.map(normalizeCell));
    const matchesAll = requiredHeaders.every((header) => cellSet.has(header));
    if (matchesAll) indices.push(i);
  }

  return indices;
}

export function buildHeaderMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, index) => {
    const key = normalizeCell(cell);
    if (key) map[key] = index;
  });
  return map;
}

export function rowContainsMarker(row, columnIndex, marker) {
  if (columnIndex === undefined || columnIndex === -1) return false;
  const value = row[columnIndex];
  if (value === undefined || value === null) return false;
  return String(value).toUpperCase().includes(marker.toUpperCase());
}

// True when every recognized (header-mapped) cell in the row is empty. A
// worksheet's used range can extend well past its last real data row (e.g.
// formatting/merged cells applied down to row 881 when only 440 rows have
// data) — sheet_to_json still yields one array per row in that range. Such
// rows are not detail-row candidates at all and must never be scored
// against timestamp/ticket-id validity, or they inflate lost-row counts
// with phantom rows that were never real source data.
export function isRowBlank(row, headerMap) {
  return Object.values(headerMap).every((columnIndex) => {
    const value = row[columnIndex];
    return value === undefined || value === null || String(value).trim() === "";
  });
}

export function sliceBlocks(rows, headerIndices) {
  return headerIndices.map((headerIndex, i) => {
    const nextHeaderIndex = headerIndices[i + 1] ?? rows.length;
    return {
      headerIndex,
      dataStart: headerIndex + 1,
      dataEnd: nextHeaderIndex,
    };
  });
}
