import {
  findHeaderRowIndex,
  buildHeaderMap,
  rowContainsMarker,
  isRowBlank,
} from "../../core/schema-detector.js";
import { combineDateAndTime, toDateKey, parseCellDateTime } from "../../core/datetime-utils.js";
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
  const skippedRows = [];

  // Only the first worksheet is treated as detail data. HYNC/SLNC workbooks
  // carry later "汇总表" / "1 HARI" summary sheets that must never be parsed
  // as raw rows (v0.2.0-prepilot revision 3).
  const sheet = workbook.sheets[0];
  if (!sheet) return null;

  const headerIndex = findHeaderRowIndex(sheet.rows, REQUIRED_HEADERS);
  if (headerIndex === -1) return null;

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

  if (markerColumn === -1 || timestampColumn === undefined) return null;

  const dataRows = sheet.rows.slice(headerIndex + 1);
  const hasMarker = dataRows.some((row) => rowContainsMarker(row, markerColumn, MARKER));
  if (!hasMarker) return null;

  dataRows.forEach((row, index) => {
    // 1-based Excel row number for this data row (headerIndex is a 0-based
    // array index; dataRows[0] is the row immediately below the header).
    const excelRowNumber = headerIndex + index + 2;
    const sourceRowId = `${sheet.name}#R${excelRowNumber}`;

    // A worksheet's used range can extend past its last real data row
    // (formatting/merged cells reaching far below the last real row, for
    // example) — sheet_to_json still yields one row per index in that
    // range. Those rows carry no data at all and are not detail-row
    // candidates; scoring them against timestamp/ticket-id validity would
    // misreport them as excluded rows even though they were never real
    // source data.
    if (isRowBlank(row, headerMap)) {
      skippedRows.push({ sourceRowId, rowIndex: excelRowNumber, reason: "blank-row" });
      return;
    }

    const timestamp = combineDateAndTime(
      dateColumn !== undefined ? row[dateColumn] : undefined,
      row[timestampColumn]
    );
    const serial = serialColumn !== undefined ? row[serialColumn] : undefined;
    const hasTicketId = serial !== undefined && serial !== null && String(serial).trim() !== "";

    if (!timestamp || !hasTicketId) {
      lostRows.push({
        sourceRowId,
        rowIndex: excelRowNumber,
        reason: !timestamp ? "invalid-datetime" : "missing-ticket-id",
      });
      return;
    }

    // Operational report date comes from 日期 (report date), never from
    // 毛重时间's own date — a Night Shift file's row timestamps can cross
    // midnight, but the report as a whole must stay one operational group
    // (v0.2.0-prepilot revision 3). Falls back to the row timestamp only if
    // 日期 itself is unparseable, so a malformed date column can't turn an
    // otherwise-valid row into a lost row.
    const reportDateRaw = dateColumn !== undefined ? row[dateColumn] : undefined;
    const reportDate = parseCellDateTime(reportDateRaw) || timestamp;

    const remark = markerColumn !== -1 ? row[markerColumn] : "";
    const pileId = cleanPileId(remark);
    const dtIdRaw = dtIdColumn !== undefined ? row[dtIdColumn] : "";
    const netRaw = netColumn !== undefined ? row[netColumn] : 0;
    const spec = specColumn !== undefined ? row[specColumn] : "";
    const { source, grade } = parseSourceGrade(spec);
    const { contractor, normalizedDtId } = joinContractor(dtIdRaw, listDt);

    cleanRows.push({
      TANGGAL: toDateKey(reportDate),
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
      _sourceRowId: sourceRowId,
    });
  });

  return { cleanRows, lostRows, skippedRows };
}
