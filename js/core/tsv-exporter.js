import { formatDateOnly, formatDecimal, extractNumericGrade } from "./output-formatter.js";

export const OUTPUT_COLUMN_ORDER = [
  "TANGGAL",
  "NO. DT",
  "Contractor",
  "Shift",
  "Datetime",
  "NO.NOTA",
  "Type",
  "Buyer",
  "Net",
  "PILE ID",
  "Source",
  "Grade",
  "Profile",
];

function formatCell(row, column, decimalSeparator) {
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
  if (value === undefined || value === null) return "";
  return String(value);
}

export function rowsToTsv(rows, { includeHeader = false, decimalSeparator = "." } = {}) {
  const lines = [];

  if (includeHeader) {
    lines.push(OUTPUT_COLUMN_ORDER.join("\t"));
  }

  rows.forEach((row) => {
    lines.push(
      OUTPUT_COLUMN_ORDER.map((column) => formatCell(row, column, decimalSeparator)).join("\t")
    );
  });

  return lines.join("\n");
}
