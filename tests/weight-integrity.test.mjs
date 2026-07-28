// Regression tests for Row-Level Weight Integrity Validation (v1.1.0,
// DECISIONS.md D010, CLEANING_LOGIC_SPEC.md §19).
//
// Plain Node, no test framework or dependencies: run with
//   node tests/weight-integrity.test.mjs
// (Node >= 18 for global File/fetch.) Loads the vendored SheetJS build the
// app itself ships (lib/sheetjs/xlsx.full.min.js) via CJS require, same
// pattern as tests/lost-row-reconciliation.test.mjs, so the HYNC/SLNC/ESG
// pipeline tests exercise the exact same read path the browser app uses.

import { createRequire } from "module";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.dirname(fileURLToPath(import.meta.url)) + "/..";

globalThis.XLSX = require(path.join(repoRoot, "lib/sheetjs/xlsx.full.min.js"));

const { readWorkbook } = await import("file://" + repoRoot + "/js/core/excel-reader.js");
const { clean: cleanHync } = await import("file://" + repoRoot + "/js/profiles/hync/cleaner.js");
const { clean: cleanSlnc } = await import("file://" + repoRoot + "/js/profiles/slnc/cleaner.js");
const { clean: cleanEsg } = await import("file://" + repoRoot + "/js/profiles/esg/cleaner.js");
const { computeGroupValidation } = await import(
  "file://" + repoRoot + "/js/core/validation-engine.js"
);
const { computeGroupReadiness, READINESS } = await import(
  "file://" + repoRoot + "/js/core/readiness.js"
);
const { rowsToTsv, OUTPUT_COLUMN_ORDER } = await import(
  "file://" + repoRoot + "/js/core/tsv-exporter.js"
);
const {
  validateWeightIntegrity,
  parseToMinorUnits,
  WEIGHT_ISSUE_CODES,
} = await import("file://" + repoRoot + "/js/core/weight-integrity.js");

function noopJoinContractor() {
  return { contractor: "Unmatched", normalizedDtId: "" };
}

// Real confirmed config (config/app-config.json "weightIntegrity") — HYNC/
// SLNC integer kg, ESG hundredths of a tonne — reused directly rather than
// re-typed, so a drift between the shipped config and these tests would
// show up as a copy/paste diff during review.
const REAL_WEIGHT_CONFIG = JSON.parse(
  await (await import("node:fs/promises")).readFile(
    path.join(repoRoot, "config/app-config.json"),
    "utf8"
  )
).weightIntegrity;

const results = [];
function test(name, fn) {
  results.push({ name, fn });
}

// =====================================================================
// A-J: pure validateWeightIntegrity()/parseToMinorUnits() unit tests
// =====================================================================

test("A - exact match: no issue, calculated Net matches Recorded Net", () => {
  const result = validateWeightIntegrity({
    gross: 73350,
    tare: 25100,
    recordedNet: 48250,
    profile: "HYNC",
    config: REAL_WEIGHT_CONFIG,
    sourceRowId: "过磅明细#R2",
  });
  assert.equal(result.calculatedNetMinorUnits, 48250);
  assert.equal(result.differenceMinorUnits, 0);
  assert.equal(result.issueCode, null);
  assert.equal(result.isValid, true);
  assert.equal(computeGroupReadiness({ ...emptyValidation(), weightIntegrityIssueCount: 0 }).blocking, false);
});

test("B - positive difference: WEIGHT_CALCULATION_MISMATCH, +10", () => {
  const result = validateWeightIntegrity({
    gross: 73350,
    tare: 25100,
    recordedNet: 48240,
    profile: "HYNC",
    config: REAL_WEIGHT_CONFIG,
    sourceRowId: "过磅明细#R2",
  });
  assert.equal(result.calculatedNetMinorUnits, 48250);
  assert.equal(result.differenceMinorUnits, 10);
  assert.equal(result.absoluteDifferenceMinorUnits, 10);
  assert.equal(result.issueCode, WEIGHT_ISSUE_CODES.WEIGHT_CALCULATION_MISMATCH);
  assert.equal(result.severity, "blocking");
  assert.equal(result.isValid, false);
});

test("C - negative difference: WEIGHT_CALCULATION_MISMATCH, -10", () => {
  const result = validateWeightIntegrity({
    gross: 73350,
    tare: 25100,
    recordedNet: 48260,
    profile: "HYNC",
    config: REAL_WEIGHT_CONFIG,
    sourceRowId: "过磅明细#R2",
  });
  assert.equal(result.calculatedNetMinorUnits, 48250);
  assert.equal(result.differenceMinorUnits, -10);
  assert.equal(result.absoluteDifferenceMinorUnits, 10);
  assert.equal(result.issueCode, WEIGHT_ISSUE_CODES.WEIGHT_CALCULATION_MISMATCH);
});

test("D - tolerance boundary: 5 no mismatch, 6 mismatches (absolute difference)", () => {
  const tolerantConfig = {
    HYNC: { enabled: true, sourceUnit: "kg", decimalPlaces: 0, toleranceMinorUnits: 5 },
  };
  const atTolerance = validateWeightIntegrity({
    gross: 100005,
    tare: 50000,
    recordedNet: 50000,
    profile: "HYNC",
    config: tolerantConfig,
    sourceRowId: "R1",
  });
  assert.equal(atTolerance.differenceMinorUnits, 5);
  assert.equal(atTolerance.issueCode, null, "difference == tolerance must not mismatch");

  const overTolerance = validateWeightIntegrity({
    gross: 100006,
    tare: 50000,
    recordedNet: 50000,
    profile: "HYNC",
    config: tolerantConfig,
    sourceRowId: "R2",
  });
  assert.equal(overTolerance.differenceMinorUnits, 6);
  assert.equal(overTolerance.issueCode, WEIGHT_ISSUE_CODES.WEIGHT_CALCULATION_MISMATCH);

  // Symmetric on the negative side (absolute difference).
  const negativeAtTolerance = validateWeightIntegrity({
    gross: 100000,
    tare: 50000,
    recordedNet: 50005,
    profile: "HYNC",
    config: tolerantConfig,
    sourceRowId: "R3",
  });
  assert.equal(negativeAtTolerance.issueCode, null);
});

test("E - decimal precision: ESG-shaped 2-decimal values, no floating-point false mismatch", () => {
  // 73.26 - 24.50 = 48.76 exactly, mirroring a real ESG sample row.
  const result = validateWeightIntegrity({
    gross: 73.26,
    tare: 24.5,
    recordedNet: 48.76,
    profile: "ESG",
    config: REAL_WEIGHT_CONFIG,
    sourceRowId: "ESG#R5",
  });
  assert.equal(result.grossMinorUnits, 7326);
  assert.equal(result.tareMinorUnits, 2450);
  assert.equal(result.recordedNetMinorUnits, 4876);
  assert.equal(result.calculatedNetMinorUnits, 4876);
  assert.equal(result.differenceMinorUnits, 0);
  assert.equal(result.issueCode, null, "must not be a false mismatch from float noise");

  // A value classically prone to float noise: 0.1 + 0.2 style triplet.
  const noisy = validateWeightIntegrity({
    gross: 71.22,
    tare: 25.42,
    recordedNet: 45.8,
    profile: "ESG",
    config: REAL_WEIGHT_CONFIG,
    sourceRowId: "ESG#R6",
  });
  assert.equal(noisy.calculatedNetMinorUnits, 4580);
  assert.equal(noisy.differenceMinorUnits, 0);
  assert.equal(noisy.issueCode, null);

  // Formatting (fewer/more trailing zeros) must never affect the compare.
  assert.equal(parseToMinorUnits(45.8, 2).minorUnits, parseToMinorUnits(45.80, 2).minorUnits);
});

test("F - invalid Gross: INVALID_GROSS_WEIGHT only, no secondary mismatch", () => {
  const missing = validateWeightIntegrity({
    gross: undefined,
    tare: 25100,
    recordedNet: 48250,
    profile: "HYNC",
    config: REAL_WEIGHT_CONFIG,
    sourceRowId: "R1",
  });
  assert.equal(missing.issueCode, WEIGHT_ISSUE_CODES.INVALID_GROSS_WEIGHT);
  assert.equal(missing.severity, "blocking");
  assert.equal(missing.calculatedNetMinorUnits, null, "must not compute a mismatch alongside this");

  const nonNumeric = validateWeightIntegrity({
    gross: "N/A",
    tare: 25100,
    recordedNet: 48250,
    profile: "HYNC",
    config: REAL_WEIGHT_CONFIG,
    sourceRowId: "R2",
  });
  assert.equal(nonNumeric.issueCode, WEIGHT_ISSUE_CODES.INVALID_GROSS_WEIGHT);
});

test("G - invalid Tare: INVALID_TARE_WEIGHT", () => {
  const result = validateWeightIntegrity({
    gross: 73350,
    tare: "",
    recordedNet: 48250,
    profile: "HYNC",
    config: REAL_WEIGHT_CONFIG,
    sourceRowId: "R1",
  });
  assert.equal(result.issueCode, WEIGHT_ISSUE_CODES.INVALID_TARE_WEIGHT);
  assert.equal(result.severity, "blocking");
});

test("H - invalid Recorded Net: INVALID_RECORDED_NET_WEIGHT", () => {
  const result = validateWeightIntegrity({
    gross: 73350,
    tare: 25100,
    recordedNet: null,
    profile: "HYNC",
    config: REAL_WEIGHT_CONFIG,
    sourceRowId: "R1",
  });
  assert.equal(result.issueCode, WEIGHT_ISSUE_CODES.INVALID_RECORDED_NET_WEIGHT);
  assert.equal(result.severity, "blocking");
});

test("I - Gross below Tare: GROSS_BELOW_TARE, not treated as an ordinary mismatch", () => {
  const result = validateWeightIntegrity({
    gross: 20000,
    tare: 25000,
    recordedNet: -5000,
    profile: "HYNC",
    config: REAL_WEIGHT_CONFIG,
    sourceRowId: "R1",
  });
  // Negative recordedNet would also qualify as NEGATIVE_WEIGHT_VALUE, but
  // Gross < Tare is itself already checked only after negativity, so a
  // fixture where recordedNet is negative surfaces NEGATIVE_WEIGHT_VALUE
  // first (most-specific root cause: an actually-impossible raw value).
  assert.equal(result.issueCode, WEIGHT_ISSUE_CODES.NEGATIVE_WEIGHT_VALUE);

  // Isolate Gross < Tare on its own with an otherwise valid (non-negative)
  // Recorded Net.
  const isolated = validateWeightIntegrity({
    gross: 20000,
    tare: 25000,
    recordedNet: 500,
    profile: "HYNC",
    config: REAL_WEIGHT_CONFIG,
    sourceRowId: "R2",
  });
  assert.equal(isolated.issueCode, WEIGHT_ISSUE_CODES.GROSS_BELOW_TARE);
  assert.equal(isolated.severity, "blocking");
});

test("valid zero values are never auto-flagged as invalid", () => {
  const result = validateWeightIntegrity({
    gross: 0,
    tare: 0,
    recordedNet: 0,
    profile: "HYNC",
    config: REAL_WEIGHT_CONFIG,
    sourceRowId: "R1",
  });
  assert.equal(result.issueCode, null);
  assert.equal(result.isValid, true);
});

test("disabled/unconfigured profile is a silent no-op (never crashes, never flags)", () => {
  const result = validateWeightIntegrity({
    gross: 1,
    tare: 999999,
    recordedNet: -12345,
    profile: "HYNC",
    config: { HYNC: { enabled: false } },
    sourceRowId: "R1",
  });
  assert.equal(result.status, "DISABLED");
  assert.equal(result.isValid, true);
  assert.equal(result.issueCode, null);

  const noConfigAtAll = validateWeightIntegrity({
    gross: 1,
    tare: 2,
    recordedNet: 3,
    profile: "HYNC",
    config: undefined,
    sourceRowId: "R1",
  });
  assert.equal(noConfigAtAll.status, "DISABLED");
});

function emptyValidation() {
  return {
    unmatchedDtCount: 0,
    missingSourceCount: 0,
    missingGradeCount: 0,
    duplicateNotaCount: 0,
    pileIdSourceConflictCount: 0,
    lostRowCount: 0,
    shiftWarningCount: 0,
  };
}

// =====================================================================
// HYNC/SLNC/ESG fixture builders (mirrors tests/lost-row-reconciliation
// .test.mjs's approach: real .xlsx buffers via the vendored SheetJS build,
// not hand-built row arrays)
// =====================================================================

const HYNC_SLNC_HEADERS = [
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
const HYNC_SLNC_HEADERS_NO_OPTIONAL = HYNC_SLNC_HEADERS.filter((h) => h !== "客户类型");

function buildHyncSlncRow(i, { marker = "SCHY", gross = 73350, tare = 25100, net = 48250 } = {}) {
  const hh = String(5 + (i % 10)).padStart(2, "0");
  return {
    流水号: `B20260714${String(1000 + i)}`,
    车号: `SCM-LIM ${300 + i}`,
    货名: "LIMONITE ORE 褐铁矿",
    发货单位: "SCM",
    毛重: gross,
    皮重: tare,
    净重: net,
    毛重时间: `2026-07-14 ${hh}:11:12`,
    皮重时间: `2026-07-14 ${hh}:33:36`,
    收货单位: "镍矿堆场B (STOCK FILE B ORE)",
    日期: new Date(2026, 6, 14),
    备注: `${marker}02991`,
    规格: "BR-C3_L10 ( NI:1.26 )",
    客户类型: 0,
  };
}

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

async function readAndClean(cleanFn, buffer, extra = {}) {
  const file = new File([buffer], "fixture.xlsx");
  const workbook = await readWorkbook(file);
  const result = cleanFn(workbook, {
    joinContractor: noopJoinContractor,
    listDt: null,
    weightIntegrityConfig: REAL_WEIGHT_CONFIG,
    ...extra,
  });
  return { workbook, result };
}

const ESG_HEADERS = [
  "NO.NOTA",
  "NO. DT",
  "MATERIAL",
  "PENYUPLAI",
  "PENERIMA",
  "TIMBANGAN ISI",
  "TIMBANGAN KOSONG",
  "TIMBANGAN BERSIH",
  "JAM TIMBANG ISI",
  "JAM TIMBANG KOSONG",
  "LOKASI DUMPING",
  "TANGGAL",
  "PILE ID",
  "KODE ORE",
];

function buildEsgRow(i, { gross = 73.26, tare = 24.5, net = 48.76 } = {}) {
  const hh = String(5 + (i % 10)).padStart(2, "0");
  return {
    "NO.NOTA": `202607140${String(100 + i)}`,
    "NO. DT": `SCM-LIM ${300 + i} DT`,
    MATERIAL: "LIMONITE ORE 褐铁矿",
    PENYUPLAI: "SCM",
    PENERIMA: "ESG-FPP",
    "TIMBANGAN ISI": gross,
    "TIMBANGAN KOSONG": tare,
    "TIMBANGAN BERSIH": net,
    "JAM TIMBANG ISI": `2026-07-14 ${hh}:54:00`,
    "JAM TIMBANG KOSONG": `2026-07-14 ${hh}:59:00`,
    "LOKASI DUMPING": "B矿区",
    TANGGAL: new Date(2026, 6, 14),
    "PILE ID": "SCESG-EX-000119",
    "KODE ORE": "L31-07 (NI:1.20)",
  };
}

function buildEsgWorkbookBuffer(rowObjects) {
  const aoa = [ESG_HEADERS, ...rowObjects.map((obj) => ESG_HEADERS.map((h) => (h in obj ? obj[h] : "")))];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "DATA ORE 14 JULI 2026");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

// =====================================================================
// J: optional/unknown columns don't shift weight-integrity columns
// =====================================================================

test("J - optional column (客户类型) present/absent, unknown trailing column: identical weight result", async () => {
  const mismatchRow = buildHyncSlncRow(0, { net: 48240 }); // Gross-Tare=48250, Recorded=48240 -> +10 mismatch
  const bufferWith = buildWorkbookBuffer(HYNC_SLNC_HEADERS, [mismatchRow], { trailingBlankRows: 5 });
  const bufferWithout = buildWorkbookBuffer(HYNC_SLNC_HEADERS_NO_OPTIONAL, [mismatchRow], {
    trailingBlankRows: 5,
  });
  const headersWithExtra = [...HYNC_SLNC_HEADERS, "UNKNOWN_EXTRA_COL"];
  const bufferExtra = buildWorkbookBuffer(
    headersWithExtra,
    [{ ...mismatchRow, UNKNOWN_EXTRA_COL: "junk" }],
    { trailingBlankRows: 5 }
  );

  const { result: withOptional } = await readAndClean(cleanHync, bufferWith);
  const { result: withoutOptional } = await readAndClean(cleanHync, bufferWithout);
  const { result: withExtra } = await readAndClean(cleanHync, bufferExtra);

  for (const result of [withOptional, withoutOptional, withExtra]) {
    assert.equal(result.cleanRows.length, 1);
    const wi = result.cleanRows[0]._weightIntegrity;
    assert.equal(wi.issueCode, WEIGHT_ISSUE_CODES.WEIGHT_CALCULATION_MISMATCH);
    assert.equal(wi.calculatedNetMinorUnits, 48250);
    assert.equal(wi.differenceMinorUnits, 10);
  }

  assert.equal(rowsToTsv(withOptional.cleanRows), rowsToTsv(withoutOptional.cleanRows));
  assert.equal(rowsToTsv(withOptional.cleanRows), rowsToTsv(withExtra.cleanRows));
});

// =====================================================================
// K/L/M: HYNC/SLNC/ESG profile mapping through the real pipeline
// =====================================================================

test("K - HYNC profile mapping: 毛重 - 皮重 = 净重, end to end through cleanHync", async () => {
  const exactRow = buildHyncSlncRow(0, { marker: "SCHY", gross: 73350, tare: 25100, net: 48250 });
  const mismatchRow = buildHyncSlncRow(1, { marker: "SCHY", gross: 73350, tare: 25100, net: 48240 });
  const buffer = buildWorkbookBuffer(HYNC_SLNC_HEADERS, [exactRow, mismatchRow], {
    trailingBlankRows: 8,
  });
  const { result } = await readAndClean(cleanHync, buffer);

  assert.equal(result.cleanRows.length, 2, "both rows remain clean rows despite the mismatch");
  assert.equal(result.lostRows.length, 0);
  assert.equal(result.skippedRows.length, 8);

  const [exact, mismatch] = result.cleanRows;
  assert.equal(exact._weightIntegrity.issueCode, null);
  assert.equal(exact.Net, 48.25, "Net conversion (÷1000) is unchanged by weight validation");
  assert.equal(mismatch._weightIntegrity.issueCode, WEIGHT_ISSUE_CODES.WEIGHT_CALCULATION_MISMATCH);
  assert.equal(mismatch.Net, 48.24, "Recorded Net (converted) is never replaced by Calculated Net");
  assert.equal(mismatch._weightIntegrity.differenceMinorUnits, 10);

  const validation = computeGroupValidation({
    profile: "HYNC",
    bucket: "DS",
    rows: result.cleanRows,
    lostRowsCount: 0,
    lostRowsDetail: [],
  });
  assert.equal(validation.weightIntegrityIssueCount, 1);
  assert.equal(validation.weightMismatchCount, 1);
  assert.equal(validation.cleanRowCount, 2, "mismatch row is not a lost row");
  assert.equal(computeGroupReadiness(validation).status, READINESS.ACTION_REQUIRED);
});

test("L - SLNC profile mapping: 毛重 - 皮重 = 净重, end to end through cleanSlnc", async () => {
  const exactRow = buildHyncSlncRow(0, { marker: "SCSL", gross: 70050, tare: 24320, net: 45730 });
  const buffer = buildWorkbookBuffer(HYNC_SLNC_HEADERS, [exactRow], { trailingBlankRows: 3 });
  const { result } = await readAndClean(cleanSlnc, buffer);

  assert.equal(result.cleanRows.length, 1);
  assert.equal(result.cleanRows[0]._weightIntegrity.issueCode, null);
  assert.equal(result.cleanRows[0]._weightIntegrity.calculatedNetMinorUnits, 45730);

  const brokenRow = buildHyncSlncRow(1, { marker: "SCSL", gross: 70050, tare: 24320, net: 45700 });
  const brokenBuffer = buildWorkbookBuffer(HYNC_SLNC_HEADERS, [brokenRow]);
  const { result: brokenResult } = await readAndClean(cleanSlnc, brokenBuffer);
  assert.equal(
    brokenResult.cleanRows[0]._weightIntegrity.issueCode,
    WEIGHT_ISSUE_CODES.WEIGHT_CALCULATION_MISMATCH
  );
});

test("M - ESG profile mapping: TIMBANGAN ISI - TIMBANGAN KOSONG = TIMBANGAN BERSIH, end to end through cleanEsg", async () => {
  const exactRow = buildEsgRow(0, { gross: 73.26, tare: 24.5, net: 48.76 });
  const mismatchRow = buildEsgRow(1, { gross: 71.22, tare: 25.42, net: 46.0 }); // calc 45.80, recorded 46.00 -> -20 (hundredths)
  const buffer = buildEsgWorkbookBuffer([exactRow, mismatchRow]);
  const { result } = await readAndClean(cleanEsg, buffer);

  assert.equal(result.cleanRows.length, 2);
  assert.ok(result.cleanRows[0]._sourceRowId, "ESG rows now carry sourceRowId (§7 traceability)");

  const exact = result.cleanRows.find((r) => r["NO.NOTA"].endsWith("100"));
  const mismatch = result.cleanRows.find((r) => r["NO.NOTA"].endsWith("101"));
  assert.equal(exact._weightIntegrity.issueCode, null);
  assert.equal(exact._weightIntegrity.calculatedNetMinorUnits, 4876);
  assert.equal(exact.Net, 48.76, "ESG Net used as-is, no /1000 conversion (LC-4), unaffected by weight validation");

  assert.equal(mismatch._weightIntegrity.issueCode, WEIGHT_ISSUE_CODES.WEIGHT_CALCULATION_MISMATCH);
  assert.equal(mismatch._weightIntegrity.calculatedNetMinorUnits, 4580);
  assert.equal(mismatch._weightIntegrity.differenceMinorUnits, -20);
  assert.equal(mismatch.Net, 46.0, "Recorded Net is never replaced by Calculated Net");
});

// =====================================================================
// N: copy gating via the centralized readiness model
// =====================================================================

test("N - copy gating: a group with one weight mismatch is ACTION_REQUIRED and blocks copy; fixing it restores readiness", () => {
  const blockedValidation = {
    ...emptyValidation(),
    weightIntegrityIssueCount: 1,
    weightMismatchCount: 1,
  };
  const blockedReadiness = computeGroupReadiness(blockedValidation);
  assert.equal(blockedReadiness.status, READINESS.ACTION_REQUIRED);
  assert.equal(blockedReadiness.blocking, true, "Copy This Profile / Copy All Groups must be disabled");

  const fixedValidation = {
    ...emptyValidation(),
    weightIntegrityIssueCount: 0,
    weightMismatchCount: 0,
  };
  const fixedReadiness = computeGroupReadiness(fixedValidation);
  assert.equal(fixedReadiness.status, READINESS.READY);
  assert.equal(fixedReadiness.blocking, false, "copy eligibility is restored once the mismatch is gone");
});

// =====================================================================
// O: TSV non-regression
// =====================================================================

test("O - TSV output schema/column order/row count unchanged; no weight-integrity leakage", async () => {
  // A lone mismatch row (Gross-Tare=48.25t, Recorded Net=48.24t) so the
  // never-leaked Calculated Net (48.25) cannot be confused with some other
  // row's legitimately-exported Net.
  const rows = [buildHyncSlncRow(0, { net: 48240 })];
  const buffer = buildWorkbookBuffer(HYNC_SLNC_HEADERS, rows);
  const { result } = await readAndClean(cleanHync, buffer);
  assert.equal(result.cleanRows[0]._weightIntegrity.issueCode, WEIGHT_ISSUE_CODES.WEIGHT_CALCULATION_MISMATCH);
  assert.equal(result.cleanRows[0]._weightIntegrity.calculatedNetMinorUnits, 48250);

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
  ]);

  const tsv = rowsToTsv(result.cleanRows);
  const lines = tsv.split("\n");
  assert.equal(lines.length, 1, "one TSV line per clean row, mismatch row is not dropped or duplicated");
  lines.forEach((line) => assert.equal(line.split("\t").length, OUTPUT_COLUMN_ORDER.length));
  assert.ok(!tsv.includes("_weightIntegrity"));
  assert.ok(!tsv.includes("_sourceRowId"));
  // Recorded Net (48.24), not Calculated Net (48.25), must be what's exported.
  assert.ok(tsv.includes("48.24"));
  assert.ok(!tsv.includes("48.25"));
});

// =====================================================================
// P: shift/grouping non-regression
// =====================================================================

test("P - shift grouping unaffected: bucket remains the sole grouping/output-Shift authority", async () => {
  const rows = [buildHyncSlncRow(0, { net: 48240 })]; // mismatch
  const buffer = buildWorkbookBuffer(HYNC_SLNC_HEADERS, rows);
  const { result } = await readAndClean(cleanHync, buffer);

  const bucket = "NS";
  result.cleanRows.forEach((row) => {
    row.Shift = bucket; // mirrors cleaning-orchestrator.js's bucket assignment
  });
  const groupKeys = new Set(result.cleanRows.map((r) => `HYNC|${r.TANGGAL}|${bucket}`));

  assert.equal(groupKeys.size, 1, "weight mismatch must not split or create a new group");
  assert.ok(result.cleanRows.every((r) => r.Shift === "NS"));
  assert.equal(
    result.cleanRows[0]._weightIntegrity.issueCode,
    WEIGHT_ISSUE_CODES.WEIGHT_CALCULATION_MISMATCH
  );
});

// =====================================================================
// Q: lost-row reconciliation non-regression
// =====================================================================

test("Q - lost-row reconciliation unaffected: mismatch rows are clean rows, not lost rows; blank padding still skipped", async () => {
  const validRows = Array.from({ length: 5 }, (_, i) => buildHyncSlncRow(i, { net: 48250 }));
  const mismatchRows = Array.from({ length: 3 }, (_, i) =>
    buildHyncSlncRow(5 + i, { net: 48240 })
  );
  const genuinelyBrokenRow = { ...buildHyncSlncRow(8), 毛重时间: "NOT-A-TIMESTAMP", 皮重时间: "NOT-A-TIMESTAMP" };

  const buffer = buildWorkbookBuffer(HYNC_SLNC_HEADERS, [...validRows, ...mismatchRows, genuinelyBrokenRow], {
    trailingBlankRows: 10,
  });
  const { result } = await readAndClean(cleanHync, buffer);

  assert.equal(result.cleanRows.length, 8, "5 valid + 3 weight-mismatched rows all remain clean rows");
  assert.equal(result.lostRows.length, 1, "only the genuinely invalid-timestamp row is lost");
  assert.equal(result.skippedRows.length, 10, "blank padding remains skipped, not lost");

  const mismatchCount = result.cleanRows.filter(
    (r) => r._weightIntegrity.issueCode === WEIGHT_ISSUE_CODES.WEIGHT_CALCULATION_MISMATCH
  ).length;
  assert.equal(mismatchCount, 3);

  const validation = computeGroupValidation({
    profile: "HYNC",
    bucket: "DS",
    rows: result.cleanRows,
    lostRowsCount: result.lostRows.length,
    lostRowsDetail: result.lostRows,
  });
  assert.equal(validation.cleanRowCount, 8);
  assert.equal(validation.lostRowCount, 1, "weight mismatches never inflate lostRowCount");
  assert.equal(validation.weightMismatchCount, 3);
});

// =====================================================================
// Runner
// =====================================================================

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
