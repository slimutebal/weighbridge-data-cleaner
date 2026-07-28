import { formatOutputCell } from "./output-formatter.js";

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
];

export function rowsToTsv(rows, { includeHeader = false, decimalSeparator = "." } = {}) {
  const lines = [];

  if (includeHeader) {
    lines.push(OUTPUT_COLUMN_ORDER.join("\t"));
  }

  rows.forEach((row) => {
    lines.push(
      OUTPUT_COLUMN_ORDER.map((column) => formatOutputCell(row, column, decimalSeparator)).join(
        "\t"
      )
    );
  });

  return lines.join("\n");
}
