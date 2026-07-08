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
