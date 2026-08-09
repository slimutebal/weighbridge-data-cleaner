// Regression tests for Low Net Weight Confirmation (v1.3.0). Plain Node,
// no test framework or dependencies: run with
//   node tests/low-net-weight.test.mjs
// (Node >= 18 for global File/fetch.) Loads the vendored SheetJS build the
// app itself ships (lib/sheetjs/xlsx.full.min.js) via CJS require, matching
// tests/weight-integrity.test.mjs and tests/weight-exception-resolution
// .test.mjs's existing style — real HYNC/SLNC/ESG pipeline exercise, not
// hand-built row arrays for the end-to-end cases.

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
const { validateWeightIntegrity, WEIGHT_ISSUE_CODES } = await import(
  "file://" + repoRoot + "/js/core/weight-integrity.js"
);
const { validateMinimumNetWeight, NET_WEIGHT_ISSUE_CODES } = await import(
  "file://" + repoRoot + "/js/core/net-weight-validation.js"
);
const {
  startNewRun,
  getRunId,
  approveLowNetException,
  revokeLowNetException,
  getLowNetApproval,
  applyLowNetApprovalsToValidation,
} = await import("file://" + repoRoot + "/js/core/low-net-weight-store.js");

const fs = await import("node:fs/promises");
const APP_CONFIG = JSON.parse(
  await fs.readFile(path.join(repoRoot, "config/app-config.json"), "utf8")
);
const REAL_WEIGHT_CONFIG = APP_CONFIG.weightIntegrity;
const REAL_MIN_NET_CONFIG = APP_CONFIG.minimumNetWeight;

function noopJoinContractor() {
  return { contractor: "Unmatched", normalizedDtId: "" };
}

function matchedJoinContractor(dtIdRaw) {
  return { contractor: "Test Contractor", normalizedDtId: dtIdRaw };
}

const results = [];
function test(name, fn) {
  results.push({ name, fn });
}

// =====================================================================
// A-D: pure validateMinimumNetWeight() unit tests
// =====================================================================

test("A - below threshold: 19.99 t -> LOW_NET_WEIGHT, blocking, threshold 20.00 t", () => {
  const wi = validateWeightIntegrity({
    gross: 24990,
    tare: 5000,
    recordedNet: 19990,
    profile: "HYNC",
    config: REAL_WEIGHT_CONFIG,
    sourceRowId: "R1",
  });
  assert.equal(wi.issueCode, null, "gross-tare must exactly match recordedNet so only LOW_NET_WEIGHT is isolated");

  const lnw = validateMinimumNetWeight({
    weightIntegrity: wi,
    profile: "HYNC",
    config: REAL_MIN_NET_CONFIG,
    sourceRowId: "R1",
  });
  assert.equal(lnw.issueCode, NET_WEIGHT_ISSUE_CODES.LOW_NET_WEIGHT);
  assert.equal(lnw.severity, "blocking");
  assert.equal(lnw.thresholdMinorUnits, 20000, "20 tonnes = 20000 kg minor units at HYNC's 0 decimal places");
  assert.equal(lnw.belowThresholdMinorUnits, 10);
});

test("B - exact boundary: 20.00 t -> no LOW_NET_WEIGHT issue", () => {
  const wi = validateWeightIntegrity({
    gross: 25000,
    tare: 5000,
    recordedNet: 20000,
    profile: "HYNC",
    config: REAL_WEIGHT_CONFIG,
    sourceRowId: "R2",
  });
  const lnw = validateMinimumNetWeight({
    weightIntegrity: wi,
    profile: "HYNC",
    config: REAL_MIN_NET_CONFIG,
    sourceRowId: "R2",
  });
  assert.equal(lnw.applicable, true);
  assert.equal(lnw.isLow, false);
  assert.equal(lnw.issueCode, null, "exactly at threshold must pass, not block");
});

test("C - above threshold: 20.01 t -> no LOW_NET_WEIGHT issue", () => {
  const wi = validateWeightIntegrity({
    gross: 25010,
    tare: 5000,
    recordedNet: 20010,
    profile: "HYNC",
    config: REAL_WEIGHT_CONFIG,
    sourceRowId: "R3",
  });
  const lnw = validateMinimumNetWeight({
    weightIntegrity: wi,
    profile: "HYNC",
    config: REAL_MIN_NET_CONFIG,
    sourceRowId: "R3",
  });
  assert.equal(lnw.isLow, false);
  assert.equal(lnw.issueCode, null);
});

test("D - invalid/negative Recorded Net: existing weight-integrity issue stays sole authority, no duplicate LOW_NET_WEIGHT", () => {
  const invalidNet = validateWeightIntegrity({
    gross: 25000,
    tare: 5000,
    recordedNet: null,
    profile: "HYNC",
    config: REAL_WEIGHT_CONFIG,
    sourceRowId: "R4",
  });
  assert.equal(invalidNet.issueCode, WEIGHT_ISSUE_CODES.INVALID_RECORDED_NET_WEIGHT);
  const lnwForInvalid = validateMinimumNetWeight({
    weightIntegrity: invalidNet,
    profile: "HYNC",
    config: REAL_MIN_NET_CONFIG,
    sourceRowId: "R4",
  });
  assert.equal(lnwForInvalid.issueCode, null, "no LOW_NET_WEIGHT alongside INVALID_RECORDED_NET_WEIGHT");
  assert.equal(lnwForInvalid.applicable, false);

  const negativeNet = validateWeightIntegrity({
    gross: 5000,
    tare: 25000,
    recordedNet: -19990,
    profile: "HYNC",
    config: REAL_WEIGHT_CONFIG,
    sourceRowId: "R5",
  });
  assert.equal(negativeNet.issueCode, WEIGHT_ISSUE_CODES.NEGATIVE_WEIGHT_VALUE);
  const lnwForNegative = validateMinimumNetWeight({
    weightIntegrity: negativeNet,
    profile: "HYNC",
    config: REAL_MIN_NET_CONFIG,
    sourceRowId: "R5",
  });
  assert.equal(lnwForNegative.issueCode, null, "no LOW_NET_WEIGHT alongside NEGATIVE_WEIGHT_VALUE");

  // A WEIGHT_CALCULATION_MISMATCH row's Recorded Net is still a
  // trustworthy parsed number (just not equal to Gross-Tare) — it stays
  // independently eligible for its own LOW_NET_WEIGHT comparison.
  const mismatchButLow = validateWeightIntegrity({
    gross: 30000,
    tare: 5000,
    recordedNet: 19990,
    profile: "HYNC",
    config: REAL_WEIGHT_CONFIG,
    sourceRowId: "R6",
  });
  assert.equal(mismatchButLow.issueCode, WEIGHT_ISSUE_CODES.WEIGHT_CALCULATION_MISMATCH);
  const lnwForMismatch = validateMinimumNetWeight({
    weightIntegrity: mismatchButLow,
    profile: "HYNC",
    config: REAL_MIN_NET_CONFIG,
    sourceRowId: "R6",
  });
  assert.equal(
    lnwForMismatch.issueCode,
    NET_WEIGHT_ISSUE_CODES.LOW_NET_WEIGHT,
    "a mismatch row's still-parseable Recorded Net is independently evaluated for low-net"
  );
});

// =====================================================================
// HYNC/SLNC/ESG fixture builders — gross = tare + net exactly, so every
// fixture row is weight-integrity-clean and isolates LOW_NET_WEIGHT as
// the only issue on the row (unless a test deliberately says otherwise).
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

const HYNC_SLNC_TARE_KG = 5000;

function buildHyncSlncRow(i, { marker = "SCHY", netKg = 48250 } = {}) {
  const hh = String(5 + (i % 10)).padStart(2, "0");
  return {
    流水号: `B20260714${String(1000 + i)}`,
    车号: `SCM-LIM ${300 + i}`,
    货名: "LIMONITE ORE 褐铁矿",
    发货单位: "SCM",
    毛重: HYNC_SLNC_TARE_KG + netKg,
    皮重: HYNC_SLNC_TARE_KG,
    净重: netKg,
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

async function readAndClean(cleanFn, buffer, { joinContractor = noopJoinContractor } = {}) {
  const file = new File([buffer], "fixture.xlsx");
  const workbook = await readWorkbook(file);
  const result = cleanFn(workbook, {
    joinContractor,
    listDt: null,
    weightIntegrityConfig: REAL_WEIGHT_CONFIG,
    minimumNetWeightConfig: REAL_MIN_NET_CONFIG,
  });
  return result;
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

const ESG_TARE_T = 5.0;

function buildEsgRow(i, { netT = 48.76 } = {}) {
  const hh = String(5 + (i % 10)).padStart(2, "0");
  return {
    "NO.NOTA": `202607140${String(100 + i)}`,
    "NO. DT": `SCM-LIM ${300 + i} DT`,
    MATERIAL: "LIMONITE ORE 褐铁矿",
    PENYUPLAI: "SCM",
    PENERIMA: "ESG-FPP",
    "TIMBANGAN ISI": Number((ESG_TARE_T + netT).toFixed(2)),
    "TIMBANGAN KOSONG": ESG_TARE_T,
    "TIMBANGAN BERSIH": netT,
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

function buildGroupAndValidation(rows, profile, { lostRowsCount = 0, lostRowsDetail = [] } = {}) {
  const group = {
    profile,
    date: rows[0].TANGGAL,
    bucket: "DS",
    rows,
    lostRowsCount,
    lostRowsDetail,
  };
  const validation = computeGroupValidation(group);
  const groupId = `${group.profile}|${group.date}|${group.bucket}`;
  return { group, validation, groupId };
}

function lowNetKeyFieldsFor(row) {
  const lnw = row._lowNetWeight;
  return { sourceRowId: lnw.sourceRowId, recordedNetMinorUnits: lnw.recordedNetMinorUnits };
}

function approveRow(groupId, row, overrides = {}) {
  const lnw = row._lowNetWeight;
  return approveLowNetException({
    groupId,
    ...lowNetKeyFieldsFor(row),
    sourceFilename: row._sourceFilename || "",
    profile: lnw.profile,
    thresholdMinorUnits: lnw.thresholdMinorUnits,
    thresholdTonnes: lnw.thresholdTonnes,
    confirmedBy: "Budi",
    confirmationReference: "WA chat 2026-07-14",
    notes: "",
    confirmedAt: new Date().toISOString(),
    ...overrides,
  });
}

// =====================================================================
// E-J: end-to-end resolution workflow via the real HYNC pipeline
// =====================================================================

test("E - one low-net row: one issue row, unresolved=1, approved=0, blocking", async () => {
  startNewRun();
  const result = await readAndClean(
    cleanHync,
    buildWorkbookBuffer(HYNC_SLNC_HEADERS, [buildHyncSlncRow(0, { netKg: 18720 })])
  );
  assert.equal(result.cleanRows.length, 1, "the low-net row remains a clean row");
  assert.equal(result.cleanRows[0]._lowNetWeight.issueCode, NET_WEIGHT_ISSUE_CODES.LOW_NET_WEIGHT);

  const { validation, groupId } = buildGroupAndValidation(result.cleanRows, "HYNC");
  assert.equal(validation.lowNetWeightCount, 1);
  assert.equal(validation.lowNetWeightRows.length, 1, "exactly one row in the consolidated table");

  const effective = applyLowNetApprovalsToValidation(validation, groupId);
  assert.equal(effective.totalLowNetCount, 1);
  assert.equal(effective.unresolvedLowNetCount, 1);
  assert.equal(effective.approvedLowNetExceptionCount, 0);
  const readiness = computeGroupReadiness(effective);
  assert.equal(readiness.status, READINESS.ACTION_REQUIRED);
  assert.equal(readiness.blocking, true, "COPY THIS GROUP/PROFILE/ALL must be disabled");
});

test("F - multiple low-net rows: one consolidated table with 3 rows, no duplicate panels", async () => {
  startNewRun();
  const result = await readAndClean(
    cleanHync,
    buildWorkbookBuffer(HYNC_SLNC_HEADERS, [
      buildHyncSlncRow(0, { netKg: 18720 }),
      buildHyncSlncRow(1, { netKg: 19500 }),
      buildHyncSlncRow(2, { netKg: 5000 }),
    ])
  );
  const { validation, groupId } = buildGroupAndValidation(result.cleanRows, "HYNC");
  assert.equal(validation.lowNetWeightRows.length, 3);
  assert.ok(
    validation.lowNetWeightRows.every((row) => row._lowNetWeight.issueCode === NET_WEIGHT_ISSUE_CODES.LOW_NET_WEIGHT)
  );

  const effective = applyLowNetApprovalsToValidation(validation, groupId);
  assert.equal(effective.totalLowNetCount, 3);
  assert.equal(effective.unresolvedLowNetCount, 3);
  assert.equal(effective.approvedLowNetExceptionCount, 0);
});

test("G - approve one of three: approved=1, unresolved=2, copy remains blocked", async () => {
  startNewRun();
  const result = await readAndClean(
    cleanHync,
    buildWorkbookBuffer(HYNC_SLNC_HEADERS, [
      buildHyncSlncRow(0, { netKg: 18720 }),
      buildHyncSlncRow(1, { netKg: 19500 }),
      buildHyncSlncRow(2, { netKg: 5000 }),
    ])
  );
  const { validation, groupId } = buildGroupAndValidation(result.cleanRows, "HYNC");

  approveRow(groupId, validation.lowNetWeightRows[0]);

  const effective = applyLowNetApprovalsToValidation(validation, groupId);
  assert.equal(effective.approvedLowNetExceptionCount, 1);
  assert.equal(effective.unresolvedLowNetCount, 2);
  assert.equal(effective.totalLowNetCount, 3, "total must remain visible");
  assert.equal(computeGroupReadiness(effective).status, READINESS.ACTION_REQUIRED);
  assert.equal(validation.lowNetWeightRows.length, 3, "row stays in the table after approval");
});

test("H - approve all: unresolved=0, READY_WITH_INFO, copy enabled when no other blocker", async () => {
  startNewRun();
  const result = await readAndClean(
    cleanHync,
    buildWorkbookBuffer(HYNC_SLNC_HEADERS, [
      buildHyncSlncRow(0, { netKg: 18720 }),
      buildHyncSlncRow(1, { netKg: 19500 }),
    ]),
    { joinContractor: matchedJoinContractor }
  );
  const { validation, groupId } = buildGroupAndValidation(result.cleanRows, "HYNC");
  validation.lowNetWeightRows.forEach((row) => approveRow(groupId, row));

  const effective = applyLowNetApprovalsToValidation(validation, groupId);
  assert.equal(effective.unresolvedLowNetCount, 0);
  assert.equal(effective.approvedLowNetExceptionCount, 2);
  assert.equal(effective.totalLowNetCount, 2, "total must remain visible even fully approved");

  const readiness = computeGroupReadiness(effective);
  assert.equal(readiness.status, READINESS.READY_WITH_INFO, "approved-only must never read as plain READY");
  assert.equal(readiness.blocking, false);

  const tsv = rowsToTsv(result.cleanRows);
  assert.ok(tsv.includes("18.72"));
  assert.ok(tsv.includes("19.5"));
});

test("I - revoke: unresolved increases, blocking restored", async () => {
  startNewRun();
  const result = await readAndClean(
    cleanHync,
    buildWorkbookBuffer(HYNC_SLNC_HEADERS, [buildHyncSlncRow(0, { netKg: 18720 })]),
    { joinContractor: matchedJoinContractor }
  );
  const { validation, groupId } = buildGroupAndValidation(result.cleanRows, "HYNC");
  const row = validation.lowNetWeightRows[0];

  approveRow(groupId, row);
  let effective = applyLowNetApprovalsToValidation(validation, groupId);
  assert.equal(computeGroupReadiness(effective).blocking, false);

  revokeLowNetException({ groupId, ...lowNetKeyFieldsFor(row) });
  effective = applyLowNetApprovalsToValidation(validation, groupId);
  assert.equal(effective.unresolvedLowNetCount, 1);
  assert.equal(effective.approvedLowNetExceptionCount, 0);
  assert.equal(computeGroupReadiness(effective).status, READINESS.ACTION_REQUIRED);
  assert.equal(computeGroupReadiness(effective).blocking, true);
  assert.equal(getLowNetApproval({ groupId, ...lowNetKeyFieldsFor(row) }), null);
});

test("J - other blocker (unmatched DT) remains after full low-net approval", async () => {
  startNewRun();
  const result = await readAndClean(
    cleanHync,
    buildWorkbookBuffer(HYNC_SLNC_HEADERS, [buildHyncSlncRow(0, { netKg: 18720 })]),
    { joinContractor: noopJoinContractor } // -> Contractor "Unmatched"
  );
  const { validation, groupId } = buildGroupAndValidation(result.cleanRows, "HYNC");
  approveRow(groupId, validation.lowNetWeightRows[0]);
  const effective = applyLowNetApprovalsToValidation(validation, groupId);

  assert.equal(effective.unresolvedLowNetCount, 0, "low-net finding itself is fully resolved");
  assert.equal(effective.unmatchedDtCount, 1, "unmatched DT is a distinct, still-blocking category");
  const readiness = computeGroupReadiness(effective);
  assert.equal(readiness.status, READINESS.ACTION_REQUIRED, "group remains blocked by the other issue");
  assert.equal(readiness.blocking, true);
});

// =====================================================================
// K/L: session scoping
// =====================================================================

test("K - refresh cleaning (startNewRun) clears low-net approvals", async () => {
  startNewRun();
  const result = await readAndClean(
    cleanHync,
    buildWorkbookBuffer(HYNC_SLNC_HEADERS, [buildHyncSlncRow(0, { netKg: 18720 })])
  );
  const { validation, groupId } = buildGroupAndValidation(result.cleanRows, "HYNC");
  const row = validation.lowNetWeightRows[0];

  approveRow(groupId, row);
  assert.ok(getLowNetApproval({ groupId, ...lowNetKeyFieldsFor(row) }));

  const previousRunId = getRunId();
  startNewRun();
  assert.notEqual(getRunId(), previousRunId);
  assert.equal(getLowNetApproval({ groupId, ...lowNetKeyFieldsFor(row) }), null);
  const effective = applyLowNetApprovalsToValidation(validation, groupId);
  assert.equal(effective.unresolvedLowNetCount, 1, "unresolved status returns after refresh");
});

test("L - changed source Recorded Net does not inherit a stale approval", async () => {
  startNewRun();
  const oldResult = await readAndClean(
    cleanHync,
    buildWorkbookBuffer(HYNC_SLNC_HEADERS, [buildHyncSlncRow(0, { netKg: 19500 })])
  );
  const { validation: oldValidation, groupId } = buildGroupAndValidation(oldResult.cleanRows, "HYNC");
  const oldRow = oldValidation.lowNetWeightRows[0];
  approveRow(groupId, oldRow);
  assert.ok(getLowNetApproval({ groupId, ...lowNetKeyFieldsFor(oldRow) }));

  // Same run, but the source Recorded Net changed (18.25 t instead of
  // 19.50 t) — the approval must not apply, since the key fields differ.
  const newResult = await readAndClean(
    cleanHync,
    buildWorkbookBuffer(HYNC_SLNC_HEADERS, [buildHyncSlncRow(0, { netKg: 18250 })])
  );
  const { validation: newValidation, groupId: sameGroupId } = buildGroupAndValidation(newResult.cleanRows, "HYNC");
  const newRow = newValidation.lowNetWeightRows[0];
  assert.equal(getLowNetApproval({ groupId: sameGroupId, ...lowNetKeyFieldsFor(newRow) }), null);
  const effective = applyLowNetApprovalsToValidation(newValidation, sameGroupId);
  assert.equal(effective.unresolvedLowNetCount, 1, "must be revalidated as unresolved, not inherited");
});

// =====================================================================
// M/N/O: HYNC/SLNC/ESG source field mapping
// =====================================================================

test("M - HYNC: 净重 mapping, one row below/one above threshold", async () => {
  const result = await readAndClean(
    cleanHync,
    buildWorkbookBuffer(HYNC_SLNC_HEADERS, [
      buildHyncSlncRow(0, { marker: "SCHY", netKg: 19990 }),
      buildHyncSlncRow(1, { marker: "SCHY", netKg: 25000 }),
    ])
  );
  assert.equal(result.cleanRows.length, 2);
  assert.equal(result.cleanRows[0]._lowNetWeight.issueCode, NET_WEIGHT_ISSUE_CODES.LOW_NET_WEIGHT);
  assert.equal(result.cleanRows[0].Net, 19.99, "Net conversion (÷1000) unaffected by low-net validation");
  assert.equal(result.cleanRows[1]._lowNetWeight.issueCode, null);
});

test("N - SLNC: 净重 mapping, one row below threshold", async () => {
  const result = await readAndClean(
    cleanSlnc,
    buildWorkbookBuffer(HYNC_SLNC_HEADERS, [buildHyncSlncRow(0, { marker: "SCSL", netKg: 15000 })])
  );
  assert.equal(result.cleanRows.length, 1);
  assert.equal(result.cleanRows[0]._lowNetWeight.issueCode, NET_WEIGHT_ISSUE_CODES.LOW_NET_WEIGHT);
  assert.equal(result.cleanRows[0]._lowNetWeight.thresholdMinorUnits, 20000);
  assert.equal(result.cleanRows[0]._lowNetWeight.belowThresholdMinorUnits, 5000);
});

test("O - ESG: TIMBANGAN BERSIH mapping, 19.25 t below threshold by 0.75 t (manual acceptance case)", async () => {
  const buffer = buildEsgWorkbookBuffer([buildEsgRow(0, { netT: 19.25 })]);
  const result = await readAndClean(cleanEsg, buffer);
  assert.equal(result.cleanRows.length, 1);
  const lnw = result.cleanRows[0]._lowNetWeight;
  assert.equal(lnw.issueCode, NET_WEIGHT_ISSUE_CODES.LOW_NET_WEIGHT);
  assert.equal(lnw.thresholdMinorUnits, 2000, "20.00 t at ESG's 2 decimal places = 2000 minor units");
  assert.equal(lnw.recordedNetMinorUnits, 1925);
  assert.equal(lnw.belowThresholdMinorUnits, 75, "0.75 t below threshold");
  assert.equal(result.cleanRows[0].Net, 19.25, "ESG Net used as-is (LC-4), unaffected by low-net validation");
});

// =====================================================================
// P/Q/R: non-regression
// =====================================================================

test("P - lost-row non-regression: low-net rows remain clean rows, never lost rows", async () => {
  const validRows = Array.from({ length: 4 }, (_, i) => buildHyncSlncRow(i, { netKg: 48250 }));
  const lowNetRows = Array.from({ length: 2 }, (_, i) => buildHyncSlncRow(4 + i, { netKg: 15000 }));
  const brokenRow = { ...buildHyncSlncRow(6), 毛重时间: "NOT-A-TIMESTAMP", 皮重时间: "NOT-A-TIMESTAMP" };

  const buffer = buildWorkbookBuffer(HYNC_SLNC_HEADERS, [...validRows, ...lowNetRows, brokenRow], {
    trailingBlankRows: 5,
  });
  const result = await readAndClean(cleanHync, buffer);

  assert.equal(result.cleanRows.length, 6, "4 valid + 2 low-net rows all remain clean rows");
  assert.equal(result.lostRows.length, 1, "only the genuinely invalid-timestamp row is lost");
  assert.equal(result.skippedRows.length, 5, "blank padding remains skipped, not lost");

  const lowNetCount = result.cleanRows.filter(
    (row) => row._lowNetWeight.issueCode === NET_WEIGHT_ISSUE_CODES.LOW_NET_WEIGHT
  ).length;
  assert.equal(lowNetCount, 2);

  const { validation } = buildGroupAndValidation(result.cleanRows, "HYNC", {
    lostRowsCount: result.lostRows.length,
    lostRowsDetail: result.lostRows,
  });
  assert.equal(validation.cleanRowCount, 6);
  assert.equal(validation.lostRowCount, 1, "low-net rows never inflate lostRowCount");
  assert.equal(validation.lowNetWeightCount, 2);
});

test("Q - shift/grouping non-regression: low-net validation never splits or creates a group", async () => {
  const result = await readAndClean(
    cleanHync,
    buildWorkbookBuffer(HYNC_SLNC_HEADERS, [buildHyncSlncRow(0, { netKg: 15000 })])
  );
  const bucket = "NS";
  result.cleanRows.forEach((row) => {
    row.Shift = bucket; // mirrors cleaning-orchestrator.js's bucket assignment
  });
  const groupKeys = new Set(result.cleanRows.map((r) => `HYNC|${r.TANGGAL}|${bucket}`));
  assert.equal(groupKeys.size, 1, "low-net finding must not split or create a new group");
  assert.ok(result.cleanRows.every((r) => r.Shift === "NS"));
});

test("R - TSV non-regression: 12-column schema unchanged, Recorded Net copied, no low-net metadata leaks", async () => {
  startNewRun();
  const result = await readAndClean(
    cleanHync,
    buildWorkbookBuffer(HYNC_SLNC_HEADERS, [buildHyncSlncRow(0, { netKg: 18720 })])
  );
  const { validation, groupId } = buildGroupAndValidation(result.cleanRows, "HYNC");
  approveRow(groupId, validation.lowNetWeightRows[0], {
    confirmedBy: "Siti Confidential",
    confirmationReference: "SECRET-REF-999",
    notes: "internal note should never leak",
  });

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
  assert.equal(lines.length, 1);
  lines.forEach((line) => assert.equal(line.split("\t").length, OUTPUT_COLUMN_ORDER.length));
  assert.ok(tsv.includes("18.72"), "Recorded Net remains what's copied");
  assert.ok(!tsv.includes("Siti Confidential"));
  assert.ok(!tsv.includes("SECRET-REF-999"));
  assert.ok(!tsv.includes("internal note"));
  assert.ok(!tsv.includes("LOW_NET_WEIGHT"));
  assert.ok(!tsv.includes("APPROVED_LOW_NET"));
  assert.ok(!tsv.includes("_lowNetWeight"));
  assert.ok(!tsv.includes("20000"), "threshold minor units must never leak into the TSV");
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
