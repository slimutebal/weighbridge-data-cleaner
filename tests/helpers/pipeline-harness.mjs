// Shared, deterministic, DOM-free harness that runs the REAL cleaning
// pipeline (js/core/cleaning-orchestrator.js and everything it calls) in
// plain Node against the repo's fixed reference sample files
// (samples/hync, samples/slnc, samples/esg), for OFFLINE-1 baseline-parity
// capture/comparison (docs/OFFLINE_TEST_PLAN.md).
//
// This module duplicates NO cleaning/validation/join logic of its own — it
// only wires up the same production modules the browser app uses, with two
// narrow Node-only polyfills so those modules' unmodified fetch()/
// localStorage calls resolve against local files/memory instead of a
// browser origin:
//   - globalThis.fetch(relativePath) for the exact relative paths the app
//     already requests ("./config/app-config.json", "./config/shift-
//     rules.json", "./data/default-list-dt.json") is redirected to a local
//     file read. Any other URL is passed through to real fetch (unused
//     here, but keeps this a narrow polyfill, not a blanket network stub).
//   - globalThis.localStorage is an in-memory Map-backed store, exactly
//     like the existing polyfill in tests/dt-correction.test.mjs and
//     tests/weight-exception-resolution.test.mjs.
//
// Each call to runPipelineOnSamples() must happen in its own `node`
// process invocation — the app's core modules memoize internal state
// (list-dt-manager's `cached`, shift-classifier's `shiftRulesCache`,
// app-settings' `cache`) at ES module scope, so re-invoking within one
// process would silently reuse the first run's List DT/config state.

import { createRequire } from "module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

const require = createRequire(import.meta.url);
export const repoRoot = path.dirname(fileURLToPath(import.meta.url)) + "/../..";

class MemoryStorage {
  constructor(initial) {
    this.store = new Map(initial ? Object.entries(initial) : []);
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

const RELATIVE_FILE_ROUTES = {
  "./config/app-config.json": "config/app-config.json",
  "./config/shift-rules.json": "config/shift-rules.json",
  "./data/default-list-dt.json": "data/default-list-dt.json",
};

function installFetchPolyfill() {
  const realFetch = globalThis.fetch ? globalThis.fetch.bind(globalThis) : undefined;
  globalThis.fetch = async (url) => {
    const routed = RELATIVE_FILE_ROUTES[url];
    if (!routed) {
      if (realFetch) return realFetch(url);
      throw new Error(`pipeline-harness: no local route for fetch("${url}")`);
    }
    const absPath = path.join(repoRoot, routed);
    let text;
    try {
      text = await fs.readFile(absPath, "utf8");
    } catch {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  };
}

const SAMPLE_FILES = [
  { profile: "HYNC", relPath: "samples/hync/16-05-2026 PAGI B.xlsx", bucket: "DS" },
  { profile: "SLNC", relPath: "samples/slnc/16-05-2026 PAGI B SLNC.xlsx", bucket: "DS" },
  {
    profile: "ESG",
    relPath: "samples/esg/(Data Timbangan Ore 16 Mei  2026) DAY SHIFT.xlsx",
    bucket: "DS",
  },
];

async function buildFileObject(relPath) {
  const absPath = path.join(repoRoot, relPath);
  const buf = await fs.readFile(absPath);
  const name = path.basename(relPath);
  return {
    name,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
}

// Runs the full pipeline once, in a freshly-imported module graph (achieved
// by the caller running this in its own `node` process). `localStorageSeed`
// optionally pre-populates the List DT localStorage cache exactly as
// js/core/list-dt-manager.js's writeLocalStorageCache() would, to exercise
// cache-priority scenarios without touching production code.
export async function runPipelineOnSamples({ localStorageSeed } = {}) {
  globalThis.XLSX = require(path.join(repoRoot, "lib/sheetjs/xlsx.full.min.js"));
  globalThis.localStorage = new MemoryStorage(
    localStorageSeed
      ? { "weighbridge.listDt.cache.v1": JSON.stringify(localStorageSeed) }
      : undefined
  );
  installFetchPolyfill();

  const { runCleaning } = await import(
    "file://" + repoRoot + "/js/core/cleaning-orchestrator.js"
  );
  const { rowsToTsv, OUTPUT_COLUMN_ORDER } = await import(
    "file://" + repoRoot + "/js/core/tsv-exporter.js"
  );
  const { computeGroupReadiness } = await import(
    "file://" + repoRoot + "/js/core/readiness.js"
  );

  const bucketedFiles = await Promise.all(
    SAMPLE_FILES.map(async ({ relPath, bucket }) => ({
      file: await buildFileObject(relPath),
      bucket,
    }))
  );

  const result = await runCleaning(bucketedFiles);

  const groups = result.groups.map((group) => {
    const readiness = computeGroupReadiness(group.validation);
    const tsv = rowsToTsv(group.rows, { includeHeader: false, decimalSeparator: "." });
    return {
      profile: group.profile,
      date: group.date,
      bucket: group.bucket,
      rowCount: group.rows.length,
      netTotal: Number(group.validation.cleanTonnage.toFixed(2)),
      readiness: readiness.status,
      validation: {
        rawRowCount: group.validation.rawRowCount,
        cleanRowCount: group.validation.cleanRowCount,
        lostRowCount: group.validation.lostRowCount,
        esgReportGroups: group.validation.esgReportGroups,
        duplicateNotaCount: group.validation.duplicateNotaCount,
        missingContractorCount: group.validation.missingContractorCount,
        missingSourceCount: group.validation.missingSourceCount,
        missingGradeCount: group.validation.missingGradeCount,
        unmatchedDtCount: group.validation.unmatchedDtCount,
        shiftWarningCount: group.validation.shiftWarningCount,
        pileIdSourceConflictCount: group.validation.pileIdSourceConflictCount,
        weightIntegrityIssueCount: group.validation.weightIntegrityIssueCount,
        lowNetWeightCount: group.validation.lowNetWeightCount,
      },
      skippedRowsCount: group.skippedRowsCount,
      lostRowsCount: group.lostRowsCount,
      tsv,
      tsvLines: tsv.split("\n"),
    };
  });

  return {
    groupKey: (g) => `${g.profile}|${g.date}|${g.bucket}`,
    columnOrder: OUTPUT_COLUMN_ORDER,
    groups,
    warnings: result.warnings.map((w) => ({ type: w.type, profile: w.profile, message: w.message })),
    fileErrors: result.fileErrors,
    listDtInfo: {
      source: result.listDtInfo.source,
      recordCount: result.listDtInfo.recordCount,
      duplicateCount: result.listDtInfo.duplicates.length,
    },
  };
}
