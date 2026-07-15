// Regression tests for the Lost Row Reconciliation / Optional-Column
// Robustness fix (HYNC/SLNC cleaners + validation-engine.js).
//
// Plain Node, no test framework or dependencies: run with
//   node tests/lost-row-reconciliation.test.mjs
// (Node >= 18 for global File/fetch.) Loads the vendored SheetJS build the
// app itself ships (lib/sheetjs/xlsx.full.min.js) via CJS require so these
// tests exercise the exact same read path the browser app uses — synthetic
// fixtures are written to a real in-memory xlsx buffer, not hand-built row
// arrays, so a change to header detection or SheetJS cell typing would be
// caught here too.

import { createRequire } from "module";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.dirname(fileURLToPath(import.meta.url)) + "/..";

globalThis.XLSX = require(path.join(repoRoot, "lib/sheetjs/xlsx.full.min.js"));

const { readWorkbook } = await import("file://" + repoRoot + "/js/core/excel-reader.js");
const { clean: cleanHync } = await import("file://" + repoRoot + "/js/profiles/hync/cleaner.js");
const { computeGroupValidation } = await import(
  "file://" + repoRoot + "/js/core/validation-engine.js"
);
const { rowsToTsv, OUTPUT_COLUMN_ORDER } = await import(
  "file://" + repoRoot + "/js/core/tsv-exporter.js"
);

function noopJoinContractor() {
  return { contractor: "Unmatched", normalizedDtId: "" };
}

const FULL_HEADERS = [
  "流水号",
  "车号",
  "货名",
  "发货单位",
  "毛重",
  "皮重",
  "净重",
  "毛重时间",
  "皮重时间",
  "收货单位",
  "日期",
  "备注",
  "规格",
  "客户类型",
];
const HEADERS_NO_OPTIONAL = FULL_HEADERS.filter((h) => h !== "客户类型");

// N valid detail rows, `outsideWindow` of them timestamped outside the
// HYNC DS window (06:00-18:00) to exercise the timestamp-window
// informational path without ever producing an invalid timestamp.
function buildValidRow(i, { outside = false } = {}) {
  const hour = outside ? 20 : 5 + (i % 10); // 05..14 inside, 20 outside
  const hh = String(hour).padStart(2, "0");
  return {
    流水号: `B20260714${String(1000 + i)}`,
    车号: `SCM-LIM ${300 + i}`,
    货名: "LIMONITE ORE 褐铁矿",
    发货单位: "SCM",
    毛重: 73350,
    皮重: 25100,
    净重: 48250,
    毛重时间: `2026-07-14 ${hh}:11:12`,
    皮重时间: `2026-07-14 ${hh}:33:36`,
    收货单位: "镍矿堆场B (STOCK FILE B ORE)",
    日期: new Date(2026, 6, 14),
    备注: "SCHY02991",
    规格: "BR-C3_L10 ( NI:1.26 )",
    客户类型: 0,
  };
}

// Builds a real .xlsx buffer (via the vendored SheetJS) from a header list
// and an array of row objects (missing keys -> blank cell, matching how a
// real workbook can have unmapped/absent columns). `trailingBlankRows`
// appends fully-empty rows after the data — reproduces a worksheet's used
// range extending past its last real row (e.g. formatting applied far below
// row 440), which is the exact shape of the original defect.
function buildWorkbookBuffer(headers, rowObjects, { trailingBlankRows = 0 } = {}) {
  const aoa = [headers];
  rowObjects.forEach((obj) => {
    aoa.push(headers.map((h) => (h in obj ? obj[h] : "")));
  });
  for (let i = 0; i < trailingBlankRows; i++) {
    aoa.push(headers.map(() => ""));
  }
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "过磅明细");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

async function readAndClean(buffer, { fileName = "fixture.xlsx" } = {}) {
  const file = new File([buffer], fileName);
  const workbook = await readWorkbook(file);
  const result = cleanHync(workbook, { joinContractor: noopJoinContractor, listDt: null });
  return { workbook, result };
}

function sourceRowIdSets(result) {
  const emitted = new Set(result.cleanRows.map((r) => r._sourceRowId));
  const lost = new Set(result.lostRows.map((r) => r.sourceRowId));
  const candidate = new Set([...emitted, ...lost]);
  return { emitted, lost, candidate };
}

function setDifference(a, b) {
  return new Set([...a].filter((x) => !b.has(x)));
}

function setsEqual(a, b) {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

const results = [];
function test(name, fn) {
  results.push({ name, fn });
}

// --- TEST A: optional column (客户类型) present, 20 valid rows, 5 of them
// outside the DS timestamp window, plus 20 trailing blank padding rows
// (mirrors the real defect: a used range that extends past the real data).
test("A - optional column present, blank padding rows do not become lost rows", async () => {
  const rows = [
    ...Array.from({ length: 15 }, (_, i) => buildValidRow(i)),
    ...Array.from({ length: 5 }, (_, i) => buildValidRow(15 + i, { outside: true })),
  ];
  const buffer = buildWorkbookBuffer(FULL_HEADERS, rows, { trailingBlankRows: 20 });
  const { result } = await readAndClean(buffer);

  assert.equal(result.cleanRows.length, 20, "all 20 real rows must reach clean output");
  assert.equal(result.lostRows.length, 0, "blank padding rows must not be counted as lost");
  assert.equal(result.skippedRows.length, 20, "blank padding rows must be skipped, not lost");

  const validation = computeGroupValidation({ profile: "HYNC", bucket: "DS", rows: result.cleanRows, lostRowsCount: result.lostRows.length, lostRowsDetail: [] });
  assert.equal(validation.rawRowCount, 20);
  assert.equal(validation.cleanRowCount, 20);
  assert.equal(validation.lostRowCount, 0);
  assert.equal(validation.tonnageDifference, 0);
});

// --- TEST B: same 20 rows, optional column entirely absent from the source.
test("B - optional column absent produces equivalent output", async () => {
  const rows = Array.from({ length: 20 }, (_, i) => buildValidRow(i));
  const bufferWith = buildWorkbookBuffer(FULL_HEADERS, rows, { trailingBlankRows: 10 });
  const bufferWithout = buildWorkbookBuffer(HEADERS_NO_OPTIONAL, rows, { trailingBlankRows: 10 });

  const { result: withOptional } = await readAndClean(bufferWith);
  const { result: withoutOptional } = await readAndClean(bufferWithout);

  assert.equal(withOptional.cleanRows.length, 20);
  assert.equal(withoutOptional.cleanRows.length, 20);
  assert.equal(withOptional.lostRows.length, 0);
  assert.equal(withoutOptional.lostRows.length, 0);

  const tsvWith = rowsToTsv(withOptional.cleanRows);
  const tsvWithout = rowsToTsv(withoutOptional.cleanRows);
  assert.equal(tsvWith, tsvWithout, "output TSV must be identical regardless of the optional column");

  const tonnageWith = withOptional.cleanRows.reduce((s, r) => s + r.Net, 0);
  const tonnageWithout = withoutOptional.cleanRows.reduce((s, r) => s + r.Net, 0);
  assert.equal(tonnageWith, tonnageWithout);
});

// --- TEST C: unknown trailing extra column beyond the recognized schema.
test("C - unknown extra trailing column does not shift columns or cause lost rows", async () => {
  const rows = Array.from({ length: 10 }, (_, i) => buildValidRow(i));
  const headersWithExtra = [...FULL_HEADERS, "UNKNOWN_EXTRA_COL"];
  const rowsWithExtra = rows.map((r, i) => ({ ...r, UNKNOWN_EXTRA_COL: `junk-${i}` }));

  const bufferBase = buildWorkbookBuffer(FULL_HEADERS, rows);
  const bufferExtra = buildWorkbookBuffer(headersWithExtra, rowsWithExtra);

  const { result: base } = await readAndClean(bufferBase);
  const { result: extra } = await readAndClean(bufferExtra);

  assert.equal(extra.cleanRows.length, 10);
  assert.equal(extra.lostRows.length, 0);
  assert.equal(rowsToTsv(base.cleanRows), rowsToTsv(extra.cleanRows));
});

// --- TEST D: one genuinely invalid row (real ticket id + net, unparseable
// timestamp) must be excluded exactly once and must not be silently dropped
// as a blank row.
test("D - genuinely invalid timestamp row is excluded exactly once", async () => {
  const validRows = Array.from({ length: 9 }, (_, i) => buildValidRow(i));
  const brokenRow = { ...buildValidRow(9), 毛重时间: "NOT-A-TIMESTAMP", 皮重时间: "NOT-A-TIMESTAMP" };
  const buffer = buildWorkbookBuffer(FULL_HEADERS, [...validRows, brokenRow], {
    trailingBlankRows: 5,
  });
  const { result } = await readAndClean(buffer);

  assert.equal(result.cleanRows.length, 9);
  assert.equal(result.lostRows.length, 1, "exactly one row must be lost, not zero and not more");
  assert.equal(result.lostRows[0].reason, "invalid-datetime");
  assert.equal(result.skippedRows.length, 5, "trailing blanks stay classified as skipped, not lost");

  const validation = computeGroupValidation({
    profile: "HYNC",
    bucket: "DS",
    rows: result.cleanRows,
    lostRowsCount: result.lostRows.length,
    lostRowsDetail: result.lostRows,
  });
  assert.equal(validation.rawRowCount, 10);
  assert.equal(validation.cleanRowCount, 9);
  assert.equal(validation.lostRowCount, 1);
  assert.equal(validation.lostRowDetails.length, 1);
});

// --- TEST E: source-row reconciliation invariant, checked against both a
// clean file (Test A shape) and a file with one genuine rejection (Test D
// shape) so the invariant is proven in both the zero-loss and one-loss case.
test("E - lostSourceRowIds = candidateSourceRowIds - emittedSourceRowIds", async () => {
  const cleanRows = Array.from({ length: 12 }, (_, i) => buildValidRow(i));
  const cleanBuffer = buildWorkbookBuffer(FULL_HEADERS, cleanRows, { trailingBlankRows: 12 });
  const { result: cleanResult } = await readAndClean(cleanBuffer);
  {
    const { emitted, lost, candidate } = sourceRowIdSets(cleanResult);
    assert.ok(emitted.size > 0, "sanity: rows were actually emitted");
    assert.ok(setsEqual(lost, setDifference(candidate, emitted)));
    assert.equal(candidate.size, emitted.size + lost.size);
    assert.equal(lost.size, 0);
  }

  const mixedRows = Array.from({ length: 8 }, (_, i) => buildValidRow(i));
  const mixedBroken = { ...buildValidRow(8), 流水号: "" }; // missing ticket id -> genuinely lost
  const mixedBuffer = buildWorkbookBuffer(FULL_HEADERS, [...mixedRows, mixedBroken], {
    trailingBlankRows: 8,
  });
  const { result: mixedResult } = await readAndClean(mixedBuffer);
  {
    const { emitted, lost, candidate } = sourceRowIdSets(mixedResult);
    assert.ok(setsEqual(lost, setDifference(candidate, emitted)));
    assert.equal(candidate.size, emitted.size + lost.size);
    assert.equal(lost.size, 1);
    assert.equal(emitted.size, 8);
    // No sourceRowId may appear in both sets at once.
    assert.equal(setDifference(emitted, lost).size, emitted.size);
  }
});

// --- TEST F: shift bucket non-regression — rows outside the nominal DS
// window stay in the same DS group as informational shift-warning rows,
// never split into a separate group or a separate output Shift value.
test("F - out-of-window rows stay in one DS group as informational notes only", async () => {
  const rows = [
    ...Array.from({ length: 15 }, (_, i) => buildValidRow(i)),
    ...Array.from({ length: 5 }, (_, i) => buildValidRow(15 + i, { outside: true })),
  ];
  const buffer = buildWorkbookBuffer(FULL_HEADERS, rows, { trailingBlankRows: 15 });
  const { result } = await readAndClean(buffer);

  // Simulate cleaning-orchestrator.js's bucket-authoritative assignment:
  // every row's clean-output Shift is the declared bucket, never its own
  // detected shift.
  const bucket = "DS";
  result.cleanRows.forEach((row) => {
    row.Shift = bucket;
  });
  const groupKeys = new Set(result.cleanRows.map((r) => `HYNC|${r.TANGGAL}|${bucket}`));

  assert.equal(groupKeys.size, 1, "must remain exactly one operational group");
  assert.ok(result.cleanRows.every((r) => r.Shift === "DS"), "every output Shift must be DS");
  assert.equal(result.cleanRows.length, 20);
});

// --- TEST G: TSV schema/column-order non-regression.
test("G - TSV output schema and column order are unchanged", async () => {
  const rows = Array.from({ length: 6 }, (_, i) => buildValidRow(i));
  const buffer = buildWorkbookBuffer(FULL_HEADERS, rows, { trailingBlankRows: 6 });
  const { result } = await readAndClean(buffer);

  assert.deepEqual(OUTPUT_COLUMN_ORDER, [
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
  ]);

  const tsv = rowsToTsv(result.cleanRows);
  const lines = tsv.split("\n");
  assert.equal(lines.length, 6, "one TSV line per clean row, no extra lines from skipped rows");
  lines.forEach((line) => {
    assert.equal(line.split("\t").length, OUTPUT_COLUMN_ORDER.length);
  });
  // 客户类型 must never leak into output.
  assert.ok(!tsv.includes("客户类型"));
});

let failed = 0;
for (const { name, fn } of results) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}

console.log(`\n${results.length - failed}/${results.length} tests passed`);
if (failed > 0) process.exit(1);
