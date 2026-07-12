export function formatDateOnly(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Used only by warning/audit tables (e.g. Shift Warning Rows) that need to
// show the exact row timestamp for review. Clean output (TANGGAL, Datetime
// in the preview/TSV) must stay on formatDateOnly — see README.md.
export function formatFullDatetime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const datePart = formatDateOnly(date);
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${datePart} ${h}:${mi}:${s}`;
}

function detectAutoDecimalSeparator() {
  return (1.1).toLocaleString().includes(",") ? "," : ".";
}

export function resolveDecimalSeparator(setting) {
  if (setting === "." || setting === ",") return setting;
  return detectAutoDecimalSeparator();
}

export function formatDecimal(value, separator) {
  const num = Number(value);
  if (value === undefined || value === null || Number.isNaN(num)) return "";
  const fixed = num.toFixed(2);
  return separator === "," ? fixed.replace(".", ",") : fixed;
}

export function extractNumericGrade(rawGrade) {
  if (rawGrade === undefined || rawGrade === null) return null;
  const match = String(rawGrade).match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  return Number(match[0]);
}

// Shared clean-output cell formatting, used by TSV export, the Clean Data
// Preview table, and the View All Rows modal — one definition so all three
// always render the same value for the same cell.
export function formatOutputCell(row, column, decimalSeparator) {
  const value = row[column];
  if (column === "Datetime" && value instanceof Date) {
    return formatDateOnly(value);
  }
  if (column === "Net" && typeof value === "number") {
    return formatDecimal(value, decimalSeparator);
  }
  if (column === "Grade") {
    const numericGrade = extractNumericGrade(value);
    return numericGrade === null ? "" : formatDecimal(numericGrade, decimalSeparator);
  }
  return value === undefined || value === null ? "" : String(value);
}
