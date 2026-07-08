import {
  findHeaderRowIndex,
  buildHeaderMap,
  rowContainsMarker,
} from "../../core/schema-detector.js";
import { combineDateAndTime, toDateKey } from "../../core/datetime-utils.js";

const REQUIRED_HEADERS = [
  "流水号",
  "车号",
  "毛重",
  "皮重",
  "净重",
  "毛重时间",
  "备注",
];
const MARKER = "SCSL";
const MARKER_HEADER_CANDIDATES = ["备注", "PILE ID"];
const DATE_HEADER = "日期";
const TIMESTAMP_HEADER = "毛重时间";

export function detect(workbook) {
  for (const sheet of workbook.sheets) {
    const headerIndex = findHeaderRowIndex(sheet.rows, REQUIRED_HEADERS);
    if (headerIndex === -1) continue;

    const headerMap = buildHeaderMap(sheet.rows[headerIndex]);
    const markerHeader = MARKER_HEADER_CANDIDATES.find(
      (header) => headerMap[header] !== undefined
    );
    const markerColumn = markerHeader !== undefined ? headerMap[markerHeader] : -1;
    const timestampColumn = headerMap[TIMESTAMP_HEADER];
    const dateColumn = headerMap[DATE_HEADER];

    if (markerColumn === -1 || timestampColumn === undefined) continue;

    const dataRows = sheet.rows.slice(headerIndex + 1);
    const hasMarker = dataRows.some((row) =>
      rowContainsMarker(row, markerColumn, MARKER)
    );
    if (!hasMarker) continue;

    const rows = dataRows
      .map((row) => {
        const timestamp = combineDateAndTime(
          dateColumn !== undefined ? row[dateColumn] : undefined,
          row[timestampColumn]
        );
        if (!timestamp) return null;
        return { timestamp, dateKey: toDateKey(timestamp) };
      })
      .filter(Boolean);

    return { matched: true, sheetName: sheet.name, rows };
  }

  return { matched: false };
}
