// Development-time capture tool (not part of the automated regression
// suite — does not match tests/*.test.mjs and asserts nothing). Runs
// tests/helpers/pipeline-harness.mjs once against the repo's current
// working-tree state and writes the result as JSON to the path given as
// argv[2]. Used to capture the pre-OFFLINE-1 baseline (run before
// data/default-list-dt.json was populated, at a commit identical to
// 5c6482b for every cleaning/validation/join code path) and, later, the
// OFFLINE-1 result for comparison. See docs/OFFLINE_TEST_PLAN.md.
//
//   node tests/helpers/capture-pipeline-snapshot.mjs <output-path.json>

import fs from "node:fs/promises";
import path from "node:path";
import { runPipelineOnSamples } from "./pipeline-harness.mjs";

const outPath = process.argv[2];
if (!outPath) {
  console.error("Usage: node capture-pipeline-snapshot.mjs <output-path.json>");
  process.exit(1);
}

const snapshot = await runPipelineOnSamples();
await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");

console.log(`Captured ${snapshot.groups.length} group(s) to ${outPath}`);
snapshot.groups.forEach((g) => {
  console.log(
    `  ${g.profile} ${g.date} ${g.bucket}: rows=${g.rowCount} net=${g.netTotal} readiness=${g.readiness} unmatchedDt=${g.validation.unmatchedDtCount}`
  );
});
console.log(`listDtInfo: source=${snapshot.listDtInfo.source} recordCount=${snapshot.listDtInfo.recordCount} duplicateCount=${snapshot.listDtInfo.duplicateCount}`);
