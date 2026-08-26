// Regression tests for the Unmatched DT / New Unit contextual correction
// workflow (UI-5C, design spec §12). Plain Node, no framework — run with
//   node tests/dt-correction.test.mjs
// Exercises two DOM-free layers:
//   - js/ui/dt-correction-model.js — pure unique-DT consolidation, no
//     imports, safe to test directly.
//   - js/core/list-dt-manager.js — the existing, unmodified List DT
//     match/duplicate/conflict/sync authority reused by the new contextual
//     correction panel (js/ui/dt-correction-panel.js). A minimal in-memory
//     localStorage polyfill is installed below (mirroring the existing
//     `globalThis.XLSX = require(...)` pattern in
//     weight-exception-resolution.test.mjs) purely so this module's
//     already-existing localStorage-backed cache/pending-sync logic can be
//     exercised in plain Node — no production code changes are involved.
// DOM-level rendering (the primary correction table, affected-row
// disclosure, Save button) was verified manually in a browser instead,
// since this repo has no DOM/jsdom test harness (see the completion
// report), matching the existing test style.

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(fileURLToPath(import.meta.url)) + "/..";

// --- Minimal in-memory localStorage polyfill (test setup only) -------------
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

const { buildUniqueDtCorrections, compactValueList } = await import(
  "file://" + repoRoot + "/js/ui/dt-correction-model.js"
);
const {
  classifyDtCorrections,
  upsertLocalDtMappings,
  syncDtMappingsToGoogleSheet,
  loadListDt,
  joinContractor,
} = await import("file://" + repoRoot + "/js/core/list-dt-manager.js");

function buildRow({ dtId, rawDtId, pileId, source, nota }) {
  return {
    "NO. DT": dtId,
    _rawDtId: rawDtId ?? dtId,
    "PILE ID": pileId,
    Source: source,
    "NO.NOTA": nota,
    Contractor: "Unmatched",
  };
}

const results = [];
function test(name, fn) {
  results.push({ name, fn });
}

// --- TEST A: unique unmatched DT consolidation ------------------------------
test("A - unique unmatched DT consolidation: one correction record per unique normalized DT", () => {
  const rows = [
    buildRow({ dtId: "SCM-LIM 232", pileId: "P1", source: "S1", nota: "1" }),
    buildRow({ dtId: "SCM-LIM 233", pileId: "P1", source: "S1", nota: "2" }),
  ];
  const unique = buildUniqueDtCorrections(rows);
  assert.equal(unique.length, 2, "two unique DT ids -> two correction records, not two per-row inputs");
  assert.deepEqual(
    unique.map((e) => e.dtId).sort(),
    ["SCM-LIM 232", "SCM-LIM 233"]
  );
});

// --- TEST B: multiple source rows -> one normalized correction row ----------
test("B - 12 affected rows across 2 unique DT consolidate into exactly 2 correction records", () => {
  const rows = [
    ...Array.from({ length: 6 }, (_, i) =>
      buildRow({ dtId: "SCM-LIM 232", pileId: "P1", source: "S1", nota: `A${i}` })
    ),
    ...Array.from({ length: 6 }, (_, i) =>
      buildRow({ dtId: "SCM-LIM 233", pileId: "P2", source: "S2", nota: `B${i}` })
    ),
  ];
  const unique = buildUniqueDtCorrections(rows);
  assert.equal(unique.length, 2, "12 affected rows must consolidate into exactly 2 correction records");
  const byId = Object.fromEntries(unique.map((e) => [e.dtId, e]));
  assert.equal(byId["SCM-LIM 232"].rows.length, 6);
  assert.equal(byId["SCM-LIM 233"].rows.length, 6);

  // Multiple context values (PILE ID / Source) must be preserved as full
  // sets, never silently collapsed to one value (phase spec §7).
  const mixedContextRows = [
    buildRow({ dtId: "SCM-LIM 500", pileId: "P1", source: "S1", nota: "X1" }),
    buildRow({ dtId: "SCM-LIM 500", pileId: "P2", source: "S1", nota: "X2" }),
  ];
  const [entry] = buildUniqueDtCorrections(mixedContextRows);
  assert.deepEqual(entry.pileIds, ["P1", "P2"], "both PILE IDs for the same DT must remain visible");
  const compact = compactValueList(entry.pileIds, (count) => `+${count} more`);
  assert.equal(compact.text, "P1 +1 more");
  assert.equal(compact.title, "P1, P2", "the full list must remain available, never silently dropped");
});

// --- TEST C: new mapping ----------------------------------------------------
test("C - new mapping: classify as new, then upsert and reuse locally without network", async () => {
  const classified = await classifyDtCorrections([{ dtId: "SCM-LIM 500", contractor: "PT Baru" }]);
  assert.equal(classified[0].status, "new");
  assert.equal(classified[0].dt_id, "SCM-LIM 500");

  const applied = await upsertLocalDtMappings([{ dtId: "SCM-LIM 500", contractor: "PT Baru" }]);
  assert.equal(applied.length, 1);

  const listDt = await loadListDt();
  const joined = joinContractor("SCM-LIM 500", listDt);
  assert.equal(joined.contractor, "PT Baru", "re-clean using the updated List DT must resolve the DT locally");
});

// --- TEST D: duplicate mapping ----------------------------------------------
test("D - duplicate mapping: identical contractor is recognized as duplicate, not re-added", async () => {
  const classified = await classifyDtCorrections([{ dtId: "SCM-LIM 500", contractor: "PT Baru" }]);
  assert.equal(classified[0].status, "duplicate");
  assert.equal(classified[0].existingContractor, "PT Baru");
});

// --- TEST E: conflicting mapping is never silently overwritten --------------
test("E - conflicting mapping: a different contractor for the same DT is flagged, never silently applied", async () => {
  const classified = await classifyDtCorrections([{ dtId: "SCM-LIM 500", contractor: "PT Lain" }]);
  assert.equal(classified[0].status, "conflict");
  assert.equal(classified[0].existingContractor, "PT Baru", "the existing mapping must be reported, unchanged");

  // Production flow (js/ui/dt-correction-panel.js's handleSave) never
  // passes "conflict"-classified entries to upsertLocalDtMappings — confirm
  // the existing mapping is provably untouched by re-classifying it.
  const stillClassified = await classifyDtCorrections([{ dtId: "SCM-LIM 500", contractor: "PT Baru" }]);
  assert.equal(
    stillClassified[0].status,
    "duplicate",
    "the original mapping must still be in place — the conflicting attempt must never have overwritten it"
  );
});

// --- TEST F: local mapping remains usable if remote sync fails -------------
test("F - offline/unconfigured sync failure never undoes a successfully stored local correction", async () => {
  const applied = await upsertLocalDtMappings([{ dtId: "SCM-LIM 600", contractor: "PT Offline" }]);
  const syncResult = await syncDtMappingsToGoogleSheet(undefined, applied);
  assert.equal(syncResult.ok, false, "no endpoint configured must be reported as a failed sync");

  const listDt = await loadListDt();
  const joined = joinContractor("SCM-LIM 600", listDt);
  assert.equal(
    joined.contractor,
    "PT Offline",
    "the local mapping must remain usable for matching even though sync never succeeded"
  );
});

// --- TEST G: re-clean is requested only after a genuinely applied mapping --
test("G - re-clean callback is requested after an applied local update, never for duplicate/conflict-only saves", async () => {
  let recleanCalls = 0;

  // Mirrors js/ui/dt-correction-panel.js's handleSave control flow: only a
  // non-empty `applied` (i.e. at least one genuinely "new" entry) triggers
  // the internal re-clean callback.
  async function simulateSave(entries) {
    const classified = await classifyDtCorrections(entries);
    const newEntries = classified.filter((entry) => entry.status === "new");
    let applied = [];
    if (newEntries.length) {
      applied = await upsertLocalDtMappings(
        newEntries.map(({ dt_id, contractor }) => ({ dtId: dt_id, contractor }))
      );
    }
    if (applied.length) recleanCalls += 1;
    return applied;
  }

  await simulateSave([{ dtId: "SCM-LIM 777", contractor: "PT G" }]);
  assert.equal(recleanCalls, 1, "a genuinely new mapping must request a re-clean");

  await simulateSave([{ dtId: "SCM-LIM 777", contractor: "PT G" }]); // now a duplicate
  assert.equal(recleanCalls, 1, "a duplicate-only submission must not request another re-clean");

  await simulateSave([{ dtId: "SCM-LIM 777", contractor: "PT Different" }]); // now a conflict
  assert.equal(recleanCalls, 1, "a conflict-only submission must not request a re-clean either");
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
