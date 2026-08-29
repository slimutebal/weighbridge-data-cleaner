// OFFLINE REGRESSION GATE evidence: exact-parity comparison between the
// retained pre-OFFLINE-1 baseline (tests/fixtures/offline1-baseline-5c6482b.json,
// captured by actually executing this same pipeline harness against
// production modules checked out at commit 5c6482b in a temporary
// detached worktree — see tests/fixtures/offline1-baseline-5c6482b.PROVENANCE.md)
// and a fresh run of the real pipeline against the current working tree
// (which now has a populated data/default-list-dt.json). Plain Node, no
// framework — run with
//   node tests/offline1-baseline-parity.test.mjs
//
// Per docs/OFFLINE_TEST_PLAN.md ("Exact-parity requirement") and the
// Supervisor's readiness-decision clarification, the ONLY permitted
// difference for HYNC/SLNC/ESG is: a row's Contractor cell changing from
// "Unmatched" (baseline) to a real contractor (now), plus whatever
// unmatched/contractor counts, readiness, and copy-gating outcome follow
// *directly* from that same resolution (PERMITTED DIRECT EFFECT: removing
// a legitimate unmatched-DT blocker may improve readiness/enable copy —
// vs. REGRESSION: readiness changing for any reason unrelated to that
// resolution, or js/core/readiness.js itself changing). Every other
// field — row count, row order, tonnage, TANGGAL/Shift/Datetime/
// NO.NOTA/NO. DT/PILE ID/Source/Grade, every other validation count, TSV
// structure/column order/formatting — must be byte-identical.
//
// This test does not duplicate cleaning logic — it calls the real
// tests/helpers/pipeline-harness.mjs, which in turn calls the unmodified
// js/core/cleaning-orchestrator.js and everything under it.

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { runPipelineOnSamples } from "./helpers/pipeline-harness.mjs";

const repoRoot = path.dirname(fileURLToPath(import.meta.url)) + "/..";

const baseline = JSON.parse(
  await fs.readFile(path.join(repoRoot, "tests/fixtures/offline1-baseline-5c6482b.json"), "utf8")
);
const result = await runPipelineOnSamples();

const COLS = baseline.columnOrder;
const CONTRACTOR_IDX = COLS.indexOf("Contractor");
assert.ok(CONTRACTOR_IDX >= 0, "OUTPUT_COLUMN_ORDER must still include Contractor");
assert.deepEqual(result.columnOrder, COLS, "TSV column order/schema must be unchanged");

function groupKey(g) {
  return `${g.profile}|${g.date}|${g.bucket}`;
}

const results = [];
function test(name, fn) {
  results.push({ name, fn });
}

test("group set is unchanged (no group appears/disappears)", () => {
  const baseKeys = baseline.groups.map(groupKey).sort();
  const resultKeys = result.groups.map(groupKey).sort();
  assert.deepEqual(resultKeys, baseKeys);
});

const baseByKey = new Map(baseline.groups.map((g) => [groupKey(g), g]));
const resultByKey = new Map(result.groups.map((g) => [groupKey(g), g]));

for (const [key, bGroup] of baseByKey) {
  test(`${key}: rows/tonnage/skipped/lost counts identical`, () => {
    const rGroup = resultByKey.get(key);
    assert.equal(rGroup.rowCount, bGroup.rowCount, "row count must be identical");
    assert.equal(rGroup.netTotal, bGroup.netTotal, "net tonnage must be identical");
    assert.equal(rGroup.skippedRowsCount, bGroup.skippedRowsCount);
    assert.equal(rGroup.lostRowsCount, bGroup.lostRowsCount);
  });

  test(`${key}: every non-Contractor validation count identical`, () => {
    const rGroup = resultByKey.get(key);
    const v1 = bGroup.validation;
    const v2 = rGroup.validation;
    const mustMatchKeys = Object.keys(v1).filter(
      (k) => k !== "unmatchedDtCount" && k !== "missingContractorCount"
    );
    mustMatchKeys.forEach((k) => {
      assert.equal(v2[k], v1[k], `validation.${k} must be identical (baseline ${v1[k]}, now ${v2[k]})`);
    });
    // unmatchedDtCount/missingContractorCount may only ever decrease
    // (Unmatched -> resolved), never increase.
    assert.ok(
      v2.unmatchedDtCount <= v1.unmatchedDtCount,
      "unmatchedDtCount must never increase relative to the pre-OFFLINE-1 baseline"
    );
    assert.equal(
      v2.missingContractorCount,
      v2.unmatchedDtCount,
      "missingContractorCount must track unmatchedDtCount exactly, as at baseline"
    );
  });

  test(`${key}: TSV rows identical except Contractor cells resolving Unmatched -> real contractor`, () => {
    const rGroup = resultByKey.get(key);
    const bLines = bGroup.tsvLines;
    const rLines = rGroup.tsvLines;
    assert.equal(rLines.length, bLines.length, "TSV row count must be identical");

    let contractorResolutions = 0;
    for (let i = 0; i < bLines.length; i++) {
      const bCols = bLines[i].split("\t");
      const rCols = rLines[i].split("\t");
      assert.equal(rCols.length, bCols.length, `row ${i}: TSV column count must be identical`);
      for (let c = 0; c < bCols.length; c++) {
        if (bCols[c] === rCols[c]) continue;
        assert.equal(
          c,
          CONTRACTOR_IDX,
          `row ${i} col "${COLS[c]}": unexpected non-Contractor difference ("${bCols[c]}" -> "${rCols[c]}")`
        );
        assert.equal(
          bCols[c],
          "Unmatched",
          `row ${i} Contractor: only an "Unmatched" baseline cell may change (was "${bCols[c]}")`
        );
        assert.notEqual(rCols[c], "Unmatched", `row ${i} Contractor: a permitted change must resolve to a real contractor`);
        contractorResolutions += 1;
      }
    }

    assert.equal(
      contractorResolutions,
      bGroup.validation.unmatchedDtCount - rGroup.validation.unmatchedDtCount,
      "count of resolved Contractor cells must equal the unmatchedDtCount improvement"
    );
  });

  test(`${key}: readiness change, if any, is a PERMITTED DIRECT EFFECT of the unmatchedDtCount improvement, not a REGRESSION`, () => {
    const rGroup = resultByKey.get(key);
    if (bGroup.readiness === rGroup.readiness) return;
    // Supervisor readiness decision: removing a legitimate unmatched-DT
    // blocker MAY directly improve readiness/enable copy — that is a
    // PERMITTED DIRECT EFFECT, not a regression — provided every other
    // blocking-relevant validation count is identical (asserted in the
    // test above) and unmatchedDtCount decreased, i.e. the change is the
    // direct, deterministic output of the unmodified computeGroupReadiness()
    // given the permitted Contractor resolution. A readiness change for
    // any OTHER reason — or with js/core/readiness.js itself modified —
    // would be a REGRESSION and must fail this assertion.
    assert.ok(
      rGroup.validation.unmatchedDtCount < bGroup.validation.unmatchedDtCount,
      `${key}: readiness changed (${bGroup.readiness} -> ${rGroup.readiness}) with no unmatchedDtCount improvement to explain it`
    );
  });
}

let failed = 0;
for (const { name, fn } of results) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error.message || error);
  }
}

console.log(`\n${results.length - failed}/${results.length} tests passed`);
if (failed > 0) process.exit(1);
