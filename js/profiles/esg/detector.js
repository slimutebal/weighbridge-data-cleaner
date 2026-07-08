import {
  findAllHeaderRowIndices,
  buildHeaderMap,
  sliceBlocks,
} from "../../core/schema-detector.js";
import { combineDateAndTime, toDateKey } from "../../core/datetime-utils.js";

const REQUIRED_HEADERS = [
  "TIMBANGAN ISI",
  "TIMBANGAN KOSONG",
  "TIMBANGAN BERSIH",
];
const DATE_HEADER = "TANGGAL";
const TIMESTAMP_HEADER = "JAM TIMBANG ISI";
const NOTA_HEADER = "NO.NOTA";

function normalizeRow(row) {
  return row.map((cell) => String(cell ?? "").trim().toUpperCase());
}

export function detect(workbook) {
  for (const sheet of workbook.sheets) {
    const normalizedRows = sheet.rows.map(normalizeRow);
    const headerIndices = findAllHeaderRowIndices(
      normalizedRows,
      REQUIRED_HEADERS
    );
    if (headerIndices.length === 0) continue;

    const blocks = sliceBlocks(sheet.rows, headerIndices);
    const rows = [];

    blocks.forEach(({ headerIndex, dataStart, dataEnd }) => {
      const headerMap = buildHeaderMap(normalizedRows[headerIndex]);
      const timestampColumn = headerMap[TIMESTAMP_HEADER];
      const dateColumn = headerMap[DATE_HEADER];
      const notaColumn = headerMap[NOTA_HEADER];
      if (timestampColumn === undefined) return;

      for (let i = dataStart; i < dataEnd; i++) {
        const row = sheet.rows[i];
        if (!row || row.length === 0) continue;

        const notaValue = notaColumn !== undefined ? row[notaColumn] : undefined;
        const isBlankNota =
          notaValue === undefined ||
          notaValue === null ||
          String(notaValue).trim() === "";
        if (isBlankNota) continue;

        const timestamp = combineDateAndTime(
          dateColumn !== undefined ? row[dateColumn] : undefined,
          row[timestampColumn]
        );
        if (!timestamp) continue;

        rows.push({ timestamp, dateKey: toDateKey(timestamp) });
      }
    });

    return { matched: true, sheetName: sheet.name, rows };
  }

  return { matched: false };
}
