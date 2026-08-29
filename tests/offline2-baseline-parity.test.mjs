// PWA OFFLINE REGRESSION GATE evidence: exact-parity comparison between
// the retained approved-OFFLINE-1 baseline
// (tests/fixtures/offline2-baseline-c2e1f93.json, captured directly from
// the clean commit c2e1f93 — see
// tests/fixtures/offline2-baseline-c2e1f93.PROVENANCE.md) and a fresh run
// of the real pipeline against the current working tree. Plain Node, no
// framework — run with
//   node tests/offline2-baseline-parity.test.mjs
//
// Per docs/OFFLINE_V2_ROADMAP.md §9 and docs/OFFLINE_TEST_PLAN.md,
// OFFLINE-2 introduces ZERO new permitted differences of any kind,
// Contractor included — unlike the OFFLINE-1 gate, there is no
// Unmatched-DT exception here. Every field — row count, row order,
// tonnage, TANGGAL/Shift/Datetime/NO.NOTA/NO. DT/PILE ID/Source/Grade/
// Contractor, every validation count, readiness, TSV structure/column
// order/formatting — must be byte-identical to the approved OFFLINE-1
// state.
//
// This test does not duplicate cleaning logic — it calls the real
// tests/helpers/pipeline-harness.mjs, which in turn calls the unmodified
// js/core/cleaning-orchestrator.js and everything under it. OFFLINE-2
// does not modify any cleaning/validation/List DT production module, so
// this test exists to prove that adding the manifest/service-worker/
// registration bootstrap had zero effect on pipeline output (the Node
// harness never loads service-worker.js or manifest.json at all).

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { runPipelineOnSamples } from "./helpers/pipeline-harness.mjs";

const repoRoot = path.dirname(fileURLToPath(import.meta.url)) + "/..";

const baseline = JSON.parse(
  await fs.readFile(path.join(repoRoot, "tests/fixtures/offline2-baseline-c2e1f93.json"), "utf8")
);
const result = await runPipelineOnSamples();

function groupKey(g) {
  return `${g.profile}|${g.date}|${g.bucket}`;
}

const results = [];
function test(name, fn) {
  results.push({ name, fn });
}

test("TSV column order/schema is unchanged", () => {
  assert.deepEqual(result.columnOrder, baseline.columnOrder);
});

test("listDtInfo (source/recordCount/duplicateCount) is unchanged", () => {
  assert.deepEqual(result.listDtInfo, baseline.listDtInfo);
});

test("group set is unchanged (no group appears/disappears)", () => {
  const baseKeys = baseline.groups.map(groupKey).sort();
  const resultKeys = result.groups.map(groupKey).sort();
  assert.deepEqual(resultKeys, baseKeys);
});

const baseByKey = new Map(baseline.groups.map((g) => [groupKey(g), g]));
const resultByKey = new Map(result.groups.map((g) => [groupKey(g), g]));

for (const [key, bGroup] of baseByKey) {
  test(`${key}: rows/tonnage/readiness/skipped/lost counts byte-identical`, () => {
    const rGroup = resultByKey.get(key);
    assert.equal(rGroup.rowCount, bGroup.rowCount, "row count must be identical");
    assert.equal(rGroup.netTotal, bGroup.netTotal, "net tonnage must be identical");
    assert.equal(rGroup.readiness, bGroup.readiness, "readiness must be identical (no permitted difference in OFFLINE-2)");
    assert.equal(rGroup.skippedRowsCount, bGroup.skippedRowsCount);
    assert.equal(rGroup.lostRowsCount, bGroup.lostRowsCount);
  });

  test(`${key}: every validation count is byte-identical (no Contractor exception in OFFLINE-2)`, () => {
    const rGroup = resultByKey.get(key);
    assert.deepEqual(rGroup.validation, bGroup.validation);
  });

  test(`${key}: TSV output is byte-identical, including every Contractor cell`, () => {
    const rGroup = resultByKey.get(key);
    assert.equal(rGroup.tsv, bGroup.tsv, "TSV output must be byte-identical: zero new differences of any kind permitted in OFFLINE-2");
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
