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
import { validateWeightIntegrity } from "../../core/weight-integrity.js";
import { validateMinimumNetWeight } from "../../core/net-weight-validation.js";

const REQUIRED_HEADERS = [
  "TIMBANGAN ISI",
  "TIMBANGAN KOSONG",
  "TIMBANGAN BERSIH",
];
const DATE_HEADER = "TANGGAL";
const TIMESTAMP_HEADER = "JAM TIMBANG ISI";
const NOTA_HEADER = "NO.NOTA";
const DT_ID_HEADER = "NO. DT";
const GROSS_HEADER = "TIMBANGAN ISI";
const TARE_HEADER = "TIMBANGAN KOSONG";
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

// ESG-only KODE ORE parenthesis normalization. A newer ESG source file
// spells KODE ORE's grade parentheses using the Unicode full-width forms
// (U+FF08 "（" / U+FF09 "）") instead of ASCII "(" / ")" while otherwise
// following the same "<source> (<grade>)" shape (e.g. "L31-21（NI:1.06)").
// Only these two characters are substituted so parseSourceGrade() in
// core/normalizers.js keeps parsing its usual ASCII delimiters unchanged —
// nothing else about the value is touched, and this never runs for
// HYNC/SLNC, which never call this function.
function normalizeKodeOreParens(value) {
  if (value === undefined || value === null) return value;
  return String(value).replace(/（/g, "(").replace(/）/g, ")");
}

// ESG-only Source separator normalization. KODE ORE source segments arrive
// with inconsistent hyphen/underscore separators (e.g. "L31-08", "L31_08",
// "BR_C12-L10" all denote the same source). Canonical form depends on
// segment count: 2 segments -> "A_B", 3 segments -> "A-B_C". Idempotent —
// re-running on an already-canonical value reproduces the same value,
// since it always rebuilds from freshly-split segments rather than doing
// an in-place character replace. Only ever called from this file: HYNC and
// SLNC read Source straight from parseSourceGrade() in core/normalizers.js
// and must never pass through this. Any shape outside 2 or 3 segments (0,
// 1, or 4+) is returned trimmed-but-otherwise-unchanged rather than forced
// into a pattern, so an unrecognized value is never silently mangled.
function normalizeEsgSourceSeparators(value) {
  const trimmed = value === undefined || value === null ? "" : String(value).trim();
  if (!trimmed) return trimmed;

  const segments = trimmed.split(/[-_]+/).filter((segment) => segment !== "");

  if (segments.length === 2) {
    return `${segments[0]}_${segments[1]}`;
  }
  if (segments.length === 3) {
    return `${segments[0]}-${segments[1]}_${segments[2]}`;
  }

  return trimmed;
}

export function clean(workbook, { joinContractor, listDt, weightIntegrityConfig, minimumNetWeightConfig }) {
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
    const grossColumn = headerMap[GROSS_HEADER];
    const tareColumn = headerMap[TARE_HEADER];
    const netColumn = headerMap[NET_HEADER];
    const pileIdColumn = headerMap[PILE_ID_HEADER];
    const kodeOreColumn = headerMap[KODE_ORE_HEADER];
    if (timestampColumn === undefined) return;

    for (let i = dataStart; i < dataEnd; i++) {
      const row = sheet.rows[i];
      // 1-based Excel row number for this data row (i is a 0-based array
      // index into sheet.rows) — same sourceRowId shape as HYNC/SLNC
      // (v1.1.0), used for weight-integrity traceability (§7).
      const sourceRowId = `${sheet.name}#R${i + 1}`;
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
      const { source, grade } = parseSourceGrade(normalizeKodeOreParens(kodeOre));
      const { contractor, normalizedDtId } = joinContractor(dtIdRaw, listDt);

      // Row-level weight integrity (v1.1.0, DECISIONS.md D010): ESG Gross/
      // Tare/Recorded Net are already in tonnes (LC-4) — validated at that
      // same source precision (config decimalPlaces), never against a
      // converted value. The result is validation metadata only; Recorded
      // Net (netRaw/Net) continues unmodified regardless of the outcome.
      const weightIntegrity = validateWeightIntegrity({
        gross: grossColumn !== undefined ? row[grossColumn] : undefined,
        tare: tareColumn !== undefined ? row[tareColumn] : undefined,
        recordedNet: netColumn !== undefined ? row[netColumn] : undefined,
        profile: PROFILE_ID,
        config: weightIntegrityConfig,
        sourceRowId,
      });

      // Low Net Weight Confirmation (v1.3.0): reuses the weight-integrity
      // result's already-parsed recordedNetMinorUnits — never a second
      // parse of the raw TIMBANGAN BERSIH cell. Validation metadata
      // only; Net (netRaw) continues unmodified regardless of the
      // outcome.
      const lowNetWeight = validateMinimumNetWeight({
        weightIntegrity,
        profile: PROFILE_ID,
        config: minimumNetWeightConfig,
        sourceRowId,
      });

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
        Source: normalizeEsgSourceSeparators(source),
        Grade: grade,
        Profile: PROFILE_ID,
        _timestamp: timestamp,
        _sourceRowId: sourceRowId,
        _weightIntegrity: weightIntegrity,
        _lowNetWeight: lowNetWeight,
        _rawDtId: dtIdRaw,
      });
    }
  });

  return { cleanRows, lostRows, skippedRows };
}
