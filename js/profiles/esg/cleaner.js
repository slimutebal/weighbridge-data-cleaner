import {
  findAllHeaderRowIndices,
  buildHeaderMap,
  sliceBlocks,
} from "../../core/schema-detector.js";
import { combineDateAndTime, toDateKey, parseCellDateTime } from "../../core/datetime-utils.js";
import {
  cleanPileId,
  parseSourceGrade,
  deriveType,
  deriveBuyerEsg,
} from "../../core/normalizers.js";

const REQUIRED_HEADERS = [
  "TIMBANGAN ISI",
  "TIMBANGAN KOSONG",
  "TIMBANGAN BERSIH",
];
const DATE_HEADER = "TANGGAL";
const TIMESTAMP_HEADER = "JAM TIMBANG ISI";
const NOTA_HEADER = "NO.NOTA";
const DT_ID_HEADER = "NO. DT";
const NET_HEADER = "TIMBANGAN BERSIH";
const PILE_ID_HEADER = "PILE ID";
const KODE_ORE_HEADER = "KODE ORE";
const PROFILE_ID = "ESG";

function normalizeRow(row) {
  return row.map((cell) => String(cell ?? "").trim().toUpperCase());
}

function isParseableNumber(value) {
  if (value === undefined || value === null || value === "") return false;
  return !Number.isNaN(Number(value));
}

export function clean(workbook, { joinContractor, listDt }) {
  const cleanRows = [];
  const lostRows = [];
  const skippedRows = [];

  // Only the first worksheet is treated as detail data. ESG workbooks carry
  // a later summary sheet that must never be scanned for detail blocks
  // (v0.2.0-prepilot revision 3).
  const sheet = workbook.sheets[0];
  if (!sheet) return null;

  const normalizedRows = sheet.rows.map(normalizeRow);
  const headerIndices = findAllHeaderRowIndices(normalizedRows, REQUIRED_HEADERS);
  if (headerIndices.length === 0) return null;

  const blocks = sliceBlocks(sheet.rows, headerIndices);

  blocks.forEach(({ headerIndex, dataStart, dataEnd }) => {
    const headerMap = buildHeaderMap(normalizedRows[headerIndex]);
    const timestampColumn = headerMap[TIMESTAMP_HEADER];
    const dateColumn = headerMap[DATE_HEADER];
    const notaColumn = headerMap[NOTA_HEADER];
    const dtIdColumn = headerMap[DT_ID_HEADER];
    const netColumn = headerMap[NET_HEADER];
    const pileIdColumn = headerMap[PILE_ID_HEADER];
    const kodeOreColumn = headerMap[KODE_ORE_HEADER];
    if (timestampColumn === undefined) return;

    for (let i = dataStart; i < dataEnd; i++) {
      const row = sheet.rows[i];
      if (!row || row.length === 0) {
        skippedRows.push({ rowIndex: i, reason: "blank-row" });
        continue;
      }

      const notaValue = notaColumn !== undefined ? row[notaColumn] : undefined;
      const hasTicketId =
        notaValue !== undefined && notaValue !== null && String(notaValue).trim() !== "";

      const netRaw = netColumn !== undefined ? row[netColumn] : undefined;
      const hasNumericNet = isParseableNumber(netRaw);

      // Header/subtotal/metadata rows in ESG's repeated-block report can carry a
      // non-blank value in the NO.NOTA/NO. DT columns (a label or a rolled-up
      // formula total), but never a real TIMBANGAN BERSIH weight. Only treat a
      // row as a genuine detail-row candidate when both signals are present.
      const looksLikeDetailRow = hasTicketId && hasNumericNet;

      if (!looksLikeDetailRow) {
        skippedRows.push({ rowIndex: i, reason: "non-detail-row" });
        continue;
      }

      const timestamp = combineDateAndTime(
        dateColumn !== undefined ? row[dateColumn] : undefined,
        row[timestampColumn]
      );

      if (!timestamp) {
        lostRows.push({ rowIndex: i, reason: "invalid-datetime" });
        continue;
      }

      // Operational report date comes from TANGGAL (report date), never
      // from JAM TIMBANG ISI's own date — a Night Shift file's row
      // timestamps can cross midnight, but the report as a whole must stay
      // one operational group (v0.2.0-prepilot revision 3). Falls back to
      // the row timestamp only if TANGGAL itself is unparseable, so a
      // malformed date column can't turn an otherwise-valid row into a
      // lost row.
      const reportDateRaw = dateColumn !== undefined ? row[dateColumn] : undefined;
      const reportDate = parseCellDateTime(reportDateRaw) || timestamp;

      const pileIdRaw = pileIdColumn !== undefined ? row[pileIdColumn] : "";
      const pileId = cleanPileId(pileIdRaw);
      const dtIdRaw = dtIdColumn !== undefined ? row[dtIdColumn] : "";
      const kodeOre = kodeOreColumn !== undefined ? row[kodeOreColumn] : "";
      const { source, grade } = parseSourceGrade(kodeOre);
      const { contractor, normalizedDtId } = joinContractor(dtIdRaw, listDt);

      cleanRows.push({
        TANGGAL: toDateKey(reportDate),
        "NO. DT": normalizedDtId,
        Contractor: contractor,
        Shift: null,
        Datetime: timestamp,
        "NO.NOTA": String(notaValue).trim(),
        Type: deriveType(pileId),
        Buyer: deriveBuyerEsg(pileId),
        Net: Number(netRaw),
        "PILE ID": pileId,
        Source: source,
        Grade: grade,
        Profile: PROFILE_ID,
        _timestamp: timestamp,
        _rawDtId: dtIdRaw,
      });
    }
  });

  return { cleanRows, lostRows, skippedRows };
}
