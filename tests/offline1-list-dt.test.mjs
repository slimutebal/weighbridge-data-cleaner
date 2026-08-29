// OFFLINE-1 regression tests: real bundled List DT snapshot
// (data/default-list-dt.json), cache priority, bundled fallback, unknown
// DT handling, and no-automatic-remote-fetch. Plain Node, no framework —
// run with
//   node tests/offline1-list-dt.test.mjs
// Exercises js/core/list-dt-manager.js and js/core/normalizers.js
// unmodified (see docs/OFFLINE_V2_ROADMAP.md §6, "Protected operational
// behavior" — DT normalization/contractor join behavior must not change).
// A minimal in-memory localStorage polyfill is installed below, matching
// the existing pattern in tests/dt-correction.test.mjs.

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

const repoRoot = path.dirname(fileURLToPath(import.meta.url)) + "/..";

class MemoryStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}
globalThis.localStorage = new MemoryStorage();

// Narrow fetch polyfill: only the exact relative default-List-DT path the
// app requests is routed to a local file read. No other URL is ever
// touched here, so this test cannot silently reach the live Google
// endpoint (docs/OFFLINE_TEST_PLAN.md Scenario E requirement: loading
// List DT must not require or trigger the Google Apps Script endpoint).
let fetchCalls = [];
globalThis.fetch = async (url) => {
  fetchCalls.push(url);
  if (url === "./data/default-list-dt.json") {
    const text = await fs.readFile(path.join(repoRoot, "data/default-list-dt.json"), "utf8");
    return { ok: true, json: async () => JSON.parse(text) };
  }
  throw new Error(`Unexpected fetch("${url}") — no automatic remote List DT fetch is permitted`);
};

const { normalizeDtId } = await import("file://" + repoRoot + "/js/core/normalizers.js");

// js/core/list-dt-manager.js memoizes loadListDt()'s result at ES-module
// scope (`let cached`), with no exported reset — by design, so a real
// re-clean only reloads after upsertLocalDtMappings() explicitly clears
// it. To exercise several independent cache/bundled scenarios in one test
// process without depending on that internal detail, each scenario below
// imports the module fresh via a distinct cache-busting query string, so
// every scenario gets its own top-level `cached = null` start state — the
// same production module, re-evaluated, not a reimplementation of it.
let importCounter = 0;
async function freshListDtManager() {
  importCounter += 1;
  return import("file://" + repoRoot + "/js/core/list-dt-manager.js?scenario=" + importCounter);
}

const bundledRaw = JSON.parse(
  await fs.readFile(path.join(repoRoot, "data/default-list-dt.json"), "utf8")
);

const results = [];
function test(name, fn) {
  results.push({ name, fn });
}

// --- A. Bundled snapshot integrity ------------------------------------------
test("A1 - bundled snapshot parses as a non-empty array", () => {
  assert.ok(Array.isArray(bundledRaw), "must be a JSON array");
  assert.ok(bundledRaw.length > 0, "must be non-empty (OFFLINE-1 replaces the empty [] baseline)");
});

test("A2 - every record has non-empty dt_id and contractor, normalizeDtId(dt_id) is non-empty", () => {
  bundledRaw.forEach((record, i) => {
    assert.equal(typeof record.dt_id, "string", `record[${i}].dt_id must be a string`);
    assert.notEqual(record.dt_id.trim(), "", `record[${i}].dt_id must be non-empty`);
    assert.equal(typeof record.contractor, "string", `record[${i}].contractor must be a string`);
    assert.notEqual(record.contractor.trim(), "", `record[${i}].contractor must be non-empty`);
    assert.notEqual(normalizeDtId(record.dt_id), "", `record[${i}].dt_id must normalize to a non-empty key`);
  });
});

test("A3 - only dt_id and contractor fields are present (minimal runtime data)", () => {
  bundledRaw.forEach((record, i) => {
    const keys = Object.keys(record).sort();
    assert.deepEqual(keys, ["contractor", "dt_id"], `record[${i}] must only carry dt_id/contractor`);
  });
});

test("A4 - no normalized contractor conflicts and deterministic uniqueness per normalized dt_id", () => {
  const byKey = new Map();
  bundledRaw.forEach((record) => {
    const key = normalizeDtId(record.dt_id);
    if (byKey.has(key)) {
      assert.equal(
        byKey.get(key),
        record.contractor,
        `normalized dt_id "${key}" has conflicting contractors in the bundled snapshot`
      );
    } else {
      byKey.set(key, record.contractor);
    }
  });
});

test("A5 - bundled snapshot is deterministically sorted by dt_id ascending", () => {
  const dtIds = bundledRaw.map((r) => r.dt_id);
  const sorted = [...dtIds].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(dtIds, sorted, "records must be sorted by dt_id ascending for deterministic diffs");
});

// --- B. Cache priority -------------------------------------------------------
test("B1 - a non-empty localStorage cache wins over the bundled snapshot for the same normalized DT", async () => {
  localStorage.clear();
  const bundledEntry = bundledRaw[0];
  localStorage.setItem(
    "weighbridge.listDt.cache.v1",
    JSON.stringify({
      records: [{ dt_id: bundledEntry.dt_id, contractor: "CACHE-OVERRIDE Contractor" }],
      updatedAt: new Date().toISOString(),
    })
  );

  const { loadListDt, joinContractor } = await freshListDtManager();
  const listDt = await loadListDt();
  assert.equal(listDt.source, "cache", "source must report cache when a non-empty cache exists");
  const joined = joinContractor(bundledEntry.dt_id, listDt);
  assert.equal(
    joined.contractor,
    "CACHE-OVERRIDE Contractor",
    "cache must win over bundled data for the same normalized DT"
  );
});

// --- C. Bundled fallback ------------------------------------------------------
test("C1 - with no cache, source is bundled and known DTs resolve to their bundled contractor", async () => {
  localStorage.clear();
  const { loadListDt, joinContractor } = await freshListDtManager();
  const listDt = await loadListDt();
  assert.equal(listDt.source, "bundled", "with no cache, source must be bundled");
  assert.equal(listDt.recordCount, bundledRaw.length);

  const sample = bundledRaw[Math.floor(bundledRaw.length / 2)];
  const joined = joinContractor(sample.dt_id, listDt);
  assert.equal(joined.contractor, sample.contractor);
});

// --- D. Unknown DT ------------------------------------------------------------
test("D1 - a DT absent from the bundled snapshot resolves to Unmatched, not blank or an error", async () => {
  localStorage.clear();
  const { loadListDt, joinContractor } = await freshListDtManager();
  const listDt = await loadListDt();
  const joined = joinContractor("ZZZ-DOES-NOT-EXIST-999999", listDt);
  assert.equal(joined.contractor, "Unmatched");
  assert.notEqual(joined.normalizedDtId, "");
});

// --- E. No automatic remote update -------------------------------------------
test("E1 - loading List DT never fetches the Google Apps Script endpoint", async () => {
  localStorage.clear();
  fetchCalls = [];
  const { loadListDt } = await freshListDtManager();
  await loadListDt();
  const endpointCalls = fetchCalls.filter((u) => typeof u === "string" && u.includes("script.google.com"));
  assert.equal(endpointCalls.length, 0, "loadListDt() must never call the remote endpoint automatically");
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
