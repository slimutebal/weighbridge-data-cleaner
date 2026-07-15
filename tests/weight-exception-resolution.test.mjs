// Regression tests for Weight Exception Resolution & Consolidated Issue
// Table (v1.2.0, DECISIONS.md D011). Plain Node, no framework — run with
//   node tests/weight-exception-resolution.test.mjs
// Exercises the core (DOM-free) layer only: js/core/weight-exception-store.js,
// js/core/readiness.js, js/core/validation-engine.js, and the real HYNC
// cleaner via the vendored SheetJS build, matching the existing test style
// in this repo. DOM-level checks (fixed scroll shadows, button
// click/keyboard accessibility — tests I/J of the phase spec) were
// verified manually in a headless browser instead, since this repo has no
// DOM/jsdom test harness (see the completion report).

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
const { computeGroupReadiness, READINESS } = await import(
  "file://" + repoRoot + "/js/core/readiness.js"
);
const { rowsToTsv, OUTPUT_COLUMN_ORDER } = await import(
  "file://" + repoRoot + "/js/core/tsv-exporter.js"
);
const { WEIGHT_ISSUE_CODES } = await import("file://" + repoRoot + "/js/core/weight-integrity.js");
const {
  startNewRun,
  getRunId,
  approveException,
  revokeException,
  getApproval,
  applyApprovalsToValidation,
} = await import("file://" + repoRoot + "/js/core/weight-exception-store.js");

const fs = await import("node:fs/promises");
const REAL_WEIGHT_CONFIG = JSON.parse(
  await fs.readFile(path.join(repoRoot, "config/app-config.json"), "utf8")
).weightIntegrity;

function noopJoinContractor() {
  return { contractor: "Unmatched", normalizedDtId: "" };
}

function matchedJoinContractor(dtIdRaw) {
  return { contractor: "Test Contractor", normalizedDtId: dtIdRaw };
}

const HYNC_HEADERS = [
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

function buildRow(i, { gross = 73350, tare = 25100, net = 48240 } = {}) {
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
    备注: "SCHY02991",
    规格: "BR-C3_L10 ( NI:1.26 )",
    客户类型: 0,
  };
}

function buildWorkbookBuffer(rowObjects) {
  const aoa = [HYNC_HEADERS, ...rowObjects.map((obj) => HYNC_HEADERS.map((h) => obj[h] ?? ""))];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "过磅明细");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

async function cleanRows(rowObjects, { joinContractor = noopJoinContractor } = {}) {
  const buffer = buildWorkbookBuffer(rowObjects);
  const file = new File([buffer], "fixture.xlsx");
  const workbook = await readWorkbook(file);
  const result = cleanHync(workbook, {
    joinContractor,
    listDt: null,
    weightIntegrityConfig: REAL_WEIGHT_CONFIG,
  });
  return result.cleanRows;
}

function buildGroupAndValidation(rows, { lostRowsCount = 0, lostRowsDetail = [] } = {}) {
  const group = {
    profile: "HYNC",
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

function keyFieldsFor(row) {
  const wi = row._weightIntegrity;
  return {
    sourceRowId: wi.sourceRowId,
    grossMinorUnits: wi.grossMinorUnits,
    tareMinorUnits: wi.tareMinorUnits,
    recordedNetMinorUnits: wi.recordedNetMinorUnits,
  };
}

function approveRow(groupId, row, overrides = {}) {
  const wi = row._weightIntegrity;
  return approveException({
    groupId,
    ...keyFieldsFor(row),
    sourceFilename: row._sourceFilename,
    profile: wi.profile,
    calculatedNetMinorUnits: wi.calculatedNetMinorUnits,
    differenceMinorUnits: wi.differenceMinorUnits,
    confirmedBy: "Budi",
    confirmationReference: "WA chat 2026-07-14",
    notes: "",
    confirmedAt: new Date().toISOString(),
    ...overrides,
  });
}

const results = [];
function test(name, fn) {
  results.push({ name, fn });
}

// --- TEST A: one mismatch.
test("A - one mismatch: one panel's worth of data, unresolved=1, total=1, approved=0, blocking", async () => {
  startNewRun();
  const rows = await cleanRows([buildRow(0, { net: 48240 })]);
  const { validation, groupId } = buildGroupAndValidation(rows);

  assert.equal(validation.weightIntegrityIssueRows.length, 1, "exactly one row in the consolidated table");
  assert.equal(validation.weightMismatchCount, 1);

  const effective = applyApprovalsToValidation(validation, groupId);
  assert.equal(effective.totalWeightMismatchCount, 1);
  assert.equal(effective.unresolvedWeightMismatchCount, 1);
  assert.equal(effective.approvedWeightExceptionCount, 0);
  assert.equal(computeGroupReadiness(effective).status, READINESS.ACTION_REQUIRED);
  assert.equal(computeGroupReadiness(effective).blocking, true);
});

// --- TEST B: multiple mismatches -> one consolidated table, not one per row.
test("B - multiple mismatches: one table with 3 rows, summary Total 3 / Unresolved 3 / Approved 0", async () => {
  startNewRun();
  const rows = await cleanRows([
    buildRow(0, { net: 48240 }),
    buildRow(1, { net: 48260 }),
    buildRow(2, { net: 48200 }),
  ]);
  const { validation, groupId } = buildGroupAndValidation(rows);

  // One consolidated table: exactly one array of issue rows, length 3 —
  // never 3 separate panels/tables (§2, §18 of the phase spec).
  assert.equal(validation.weightIntegrityIssueRows.length, 3);
  assert.equal(validation.weightMismatchCount, 3);
  assert.ok(
    validation.weightIntegrityIssueRows.every(
      (row) => row._weightIntegrity.issueCode === WEIGHT_ISSUE_CODES.WEIGHT_CALCULATION_MISMATCH
    )
  );

  const effective = applyApprovalsToValidation(validation, groupId);
  assert.equal(effective.totalWeightMismatchCount, 3);
  assert.equal(effective.unresolvedWeightMismatchCount, 3);
  assert.equal(effective.approvedWeightExceptionCount, 0);
});

// --- TEST C: approve one row out of several.
test("C - approve one row: approved=1, unresolved decreases by one, remaining rows still block", async () => {
  startNewRun();
  const rows = await cleanRows([
    buildRow(0, { net: 48240 }),
    buildRow(1, { net: 48260 }),
    buildRow(2, { net: 48200 }),
  ]);
  const { validation, groupId } = buildGroupAndValidation(rows);
  const mismatchRows = validation.weightMismatchRows;

  approveRow(groupId, mismatchRows[0]);

  const effective = applyApprovalsToValidation(validation, groupId);
  assert.equal(effective.approvedWeightExceptionCount, 1);
  assert.equal(effective.unresolvedWeightMismatchCount, 2);
  assert.equal(effective.totalWeightMismatchCount, 3, "total mismatch count must remain visible");
  assert.equal(computeGroupReadiness(effective).status, READINESS.ACTION_REQUIRED, "2 unresolved rows still block");

  // Row itself stays in the table (never removed after approval).
  assert.equal(validation.weightIntegrityIssueRows.length, 3);
  assert.ok(getApproval({ groupId, ...keyFieldsFor(mismatchRows[0]) }));
});

// --- TEST D: approve every row -> readiness restored (no other blockers).
test("D - approve all rows: unresolved=0, approved=total, READY_WITH_INFO, TSV still uses Recorded Net", async () => {
  startNewRun();
  // Uses a matching contractor join so weight mismatch is the only
  // blocking issue in this group — isolates "approving every mismatch
  // restores readiness" from the separate (tested in F) "another blocker
  // still blocks" case.
  const rows = await cleanRows(
    [buildRow(0, { net: 48240 }), buildRow(1, { net: 48260 })],
    { joinContractor: matchedJoinContractor }
  );
  const { validation, groupId } = buildGroupAndValidation(rows);
  const mismatchRows = validation.weightMismatchRows;

  mismatchRows.forEach((row) => approveRow(groupId, row));

  const effective = applyApprovalsToValidation(validation, groupId);
  assert.equal(effective.unresolvedWeightMismatchCount, 0);
  assert.equal(effective.approvedWeightExceptionCount, 2);
  assert.equal(effective.totalWeightMismatchCount, 2, "total must remain visible even fully approved");

  const readiness = computeGroupReadiness(effective);
  assert.equal(readiness.status, READINESS.READY_WITH_INFO, "approved-only must never read as plain READY");
  assert.equal(readiness.blocking, false);

  // Recorded Net (converted, tonnes) — 48.24 / 48.26 — must be exactly
  // what the TSV exports, never the calculated value (48.25 each).
  const tsv = rowsToTsv(rows);
  assert.ok(tsv.includes("48.24"));
  assert.ok(tsv.includes("48.26"));
});

// --- TEST E: revoke restores blocking.
test("E - revoke approval: row returns to unresolved, copy becomes blocked again", async () => {
  startNewRun();
  const rows = await cleanRows([buildRow(0, { net: 48240 })], { joinContractor: matchedJoinContractor });
  const { validation, groupId } = buildGroupAndValidation(rows);
  const row = validation.weightMismatchRows[0];

  approveRow(groupId, row);
  let effective = applyApprovalsToValidation(validation, groupId);
  assert.equal(computeGroupReadiness(effective).blocking, false);

  revokeException({ groupId, ...keyFieldsFor(row) });
  effective = applyApprovalsToValidation(validation, groupId);
  assert.equal(effective.unresolvedWeightMismatchCount, 1);
  assert.equal(effective.approvedWeightExceptionCount, 0);
  assert.equal(computeGroupReadiness(effective).status, READINESS.ACTION_REQUIRED);
  assert.equal(computeGroupReadiness(effective).blocking, true);
  assert.equal(getApproval({ groupId, ...keyFieldsFor(row) }), null);
});

// --- TEST F: an unmatched-DT row remains blocking even when every weight
// mismatch is approved; the two issue categories stay separately tracked.
test("F - other blocker (unmatched DT) remains after full weight approval", async () => {
  startNewRun();
  const rows = await cleanRows(
    [buildRow(0, { net: 48240 })],
    { joinContractor: noopJoinContractor } // -> Contractor "Unmatched"
  );
  const { validation, groupId } = buildGroupAndValidation(rows);

  approveRow(groupId, validation.weightMismatchRows[0]);
  const effective = applyApprovalsToValidation(validation, groupId);

  assert.equal(effective.unresolvedWeightMismatchCount, 0, "weight mismatch itself is fully resolved");
  assert.equal(effective.unmatchedDtCount, 1, "unmatched DT is a distinct, still-blocking category");
  const readiness = computeGroupReadiness(effective);
  assert.equal(readiness.status, READINESS.ACTION_REQUIRED, "group remains blocked by the other issue");
  assert.equal(readiness.blocking, true);
});

// --- TEST G: Refresh Cleaning (startNewRun) clears all approvals.
test("G - refresh cleaning clears session approvals", async () => {
  startNewRun();
  const rows = await cleanRows([buildRow(0, { net: 48240 })]);
  const { validation, groupId } = buildGroupAndValidation(rows);
  const row = validation.weightMismatchRows[0];

  approveRow(groupId, row);
  assert.ok(getApproval({ groupId, ...keyFieldsFor(row) }));

  const previousRunId = getRunId();
  startNewRun(); // simulates Refresh Cleaning / Clear-Reset
  assert.notEqual(getRunId(), previousRunId);

  // Same group/row/weights as before, but a new run — approval must not
  // carry over.
  assert.equal(getApproval({ groupId, ...keyFieldsFor(row) }), null);
  const effective = applyApprovalsToValidation(validation, groupId);
  assert.equal(effective.unresolvedWeightMismatchCount, 1, "unresolved status returns after refresh");
});

// --- TEST H: changed source values (Gross/Tare/Recorded Net) invalidate
// a previously-granted approval, since the approval key is bound to them.
test("H - changed source values do not inherit an old approval", async () => {
  startNewRun();
  const originalRows = await cleanRows([buildRow(0, { net: 48240 })]);
  const { validation: originalValidation, groupId } = buildGroupAndValidation(originalRows);
  const originalRow = originalValidation.weightMismatchRows[0];
  approveRow(groupId, originalRow);
  assert.ok(getApproval({ groupId, ...keyFieldsFor(originalRow) }));

  // Same run, but the source Recorded Net changed (operator corrected the
  // file and re-ran cleaning without a full Refresh — the approval must
  // still not apply, because the key fields differ).
  const changedRows = await cleanRows([buildRow(0, { net: 48250 })]); // now exact match, no mismatch
  const { validation: changedValidation } = buildGroupAndValidation(changedRows);
  assert.equal(changedValidation.weightMismatchCount, 0, "corrected source no longer mismatches");

  // A still-mismatched but differently-valued row must not accidentally
  // match the old approval's key either.
  const stillMismatchedRows = await cleanRows([buildRow(0, { net: 48230 })]);
  const { validation: stillMismatchedValidation, groupId: sameGroupId } = buildGroupAndValidation(
    stillMismatchedRows
  );
  const newRow = stillMismatchedValidation.weightMismatchRows[0];
  assert.equal(getApproval({ groupId: sameGroupId, ...keyFieldsFor(newRow) }), null);
  const effective = applyApprovalsToValidation(stillMismatchedValidation, sameGroupId);
  assert.equal(effective.unresolvedWeightMismatchCount, 1, "must be revalidated as unresolved, not inherited");
});

// --- TEST K: TSV non-regression with approvals present.
test("K - TSV non-regression: schema/column order unchanged, approval metadata never leaks", async () => {
  startNewRun();
  const rows = await cleanRows([buildRow(0, { net: 48240 })]);
  const { validation, groupId } = buildGroupAndValidation(rows);
  approveRow(groupId, validation.weightMismatchRows[0], {
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
    "Profile",
  ]);

  const tsv = rowsToTsv(rows);
  const lines = tsv.split("\n");
  assert.equal(lines.length, 1);
  lines.forEach((line) => assert.equal(line.split("\t").length, OUTPUT_COLUMN_ORDER.length));
  assert.ok(tsv.includes("48.24"), "Recorded Net remains what's copied");
  assert.ok(!tsv.includes("48.25"), "Calculated Net must never leak");
  assert.ok(!tsv.includes("Siti Confidential"));
  assert.ok(!tsv.includes("SECRET-REF-999"));
  assert.ok(!tsv.includes("internal note"));
  assert.ok(!tsv.includes("APPROVED_RECORDED_NET"));
  assert.ok(!tsv.includes("_weightIntegrity"));
  assert.ok(!tsv.includes("_sourceFilename"));
});

// --- TEST L: shift/lost-row non-regression with an approved exception.
test("L - shift and lost-row non-regression with an approved weight exception", async () => {
  startNewRun();
  const validRows = Array.from({ length: 4 }, (_, i) => buildRow(i, { net: 48250 }));
  const mismatchRow = buildRow(4, { net: 48240 });
  const brokenRow = { ...buildRow(5), 毛重时间: "NOT-A-TIMESTAMP", 皮重时间: "NOT-A-TIMESTAMP" };

  const buffer = buildWorkbookBuffer([...validRows, mismatchRow, brokenRow]);
  const file = new File([buffer], "fixture.xlsx");
  const workbook = await readWorkbook(file);
  const result = cleanHync(workbook, {
    joinContractor: matchedJoinContractor,
    listDt: null,
    weightIntegrityConfig: REAL_WEIGHT_CONFIG,
  });

  assert.equal(result.cleanRows.length, 5, "4 valid + 1 weight-mismatched row remain clean rows");
  assert.equal(result.lostRows.length, 1, "only the genuinely invalid-timestamp row is lost");

  const bucket = "DS";
  result.cleanRows.forEach((row) => (row.Shift = bucket));
  const groupKeys = new Set(result.cleanRows.map((r) => `HYNC|${r.TANGGAL}|${bucket}`));
  assert.equal(groupKeys.size, 1, "weight exception approval must not create/split shift groups");

  const { validation, groupId } = buildGroupAndValidation(result.cleanRows, {
    lostRowsCount: result.lostRows.length,
    lostRowsDetail: result.lostRows,
  });
  approveRow(groupId, validation.weightMismatchRows[0]);
  const effective = applyApprovalsToValidation(validation, groupId);

  assert.equal(effective.cleanRowCount, 5, "approval does not change clean row count");
  assert.equal(effective.lostRowCount, 1, "approval does not change lost row count");
  assert.equal(effective.unresolvedWeightMismatchCount, 0);
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
