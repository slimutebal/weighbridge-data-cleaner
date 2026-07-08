import {
  findHeaderRowIndex,
  buildHeaderMap,
  rowContainsMarker,
} from "../../core/schema-detector.js";
import { combineDateAndTime, toDateKey } from "../../core/datetime-utils.js";
import {
  cleanPileId,
  parseSourceGrade,
  deriveType,
  deriveBuyerHyncSlnc,
} from "../../core/normalizers.js";

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
const SERIAL_HEADER = "流水号";
const DT_ID_HEADER = "车号";
const NET_HEADER = "净重";
const DATE_HEADER = "日期";
const TIMESTAMP_HEADER = "毛重时间";
const SPEC_HEADER = "规格";
const PROFILE_ID = "SLNC";

export function clean(workbook, { joinContractor, listDt }) {
  const cleanRows = [];
  const lostRows = [];

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
    const serialColumn = headerMap[SERIAL_HEADER];
    const dtIdColumn = headerMap[DT_ID_HEADER];
    const netColumn = headerMap[NET_HEADER];
    const specColumn = headerMap[SPEC_HEADER];

    if (markerColumn === -1 || timestampColumn === undefined) continue;

    const dataRows = sheet.rows.slice(headerIndex + 1);
    const hasMarker = dataRows.some((row) => rowContainsMarker(row, markerColumn, MARKER));
    if (!hasMarker) continue;

    dataRows.forEach((row, index) => {
      const timestamp = combineDateAndTime(
        dateColumn !== undefined ? row[dateColumn] : undefined,
        row[timestampColumn]
      );
      const serial = serialColumn !== undefined ? row[serialColumn] : undefined;
      const hasTicketId = serial !== undefined && serial !== null && String(serial).trim() !== "";

      if (!timestamp || !hasTicketId) {
        lostRows.push({
          rowIndex: headerIndex + 1 + index,
          reason: !timestamp ? "invalid-datetime" : "missing-ticket-id",
        });
        return;
      }

      const remark = markerColumn !== -1 ? row[markerColumn] : "";
      const pileId = cleanPileId(remark);
      const dtIdRaw = dtIdColumn !== undefined ? row[dtIdColumn] : "";
      const netRaw = netColumn !== undefined ? row[netColumn] : 0;
      const spec = specColumn !== undefined ? row[specColumn] : "";
      const { source, grade } = parseSourceGrade(spec);
      const { contractor, normalizedDtId } = joinContractor(dtIdRaw, listDt);

      cleanRows.push({
        TANGGAL: toDateKey(timestamp),
        "NO. DT": normalizedDtId,
        Contractor: contractor,
        Shift: null,
        Datetime: timestamp,
        "NO.NOTA": String(serial).trim(),
        Type: deriveType(pileId),
        Buyer: deriveBuyerHyncSlnc(pileId),
        Net: Number(netRaw) / 1000,
        "PILE ID": pileId,
        Source: source,
        Grade: grade,
        Profile: PROFILE_ID,
        _timestamp: timestamp,
        _rawDtId: dtIdRaw,
      });
    });

    return { cleanRows, lostRows };
  }

  return null;
}
