// Development-time tool (not part of the automated regression suite —
// does not match tests/*.test.mjs and asserts nothing). Prints the
// CACHE_REVISION value service-worker.js's current APP_SHELL_URLS/strategy
// would deterministically produce, so a developer can copy it into
// service-worker.js after intentionally changing the app-shell asset set
// or the worker's caching/lifecycle strategy. See
// tests/offline2-service-worker.test.mjs, which fails until the declared
// CACHE_REVISION matches this computed value.
//
//   node tests/helpers/print-cache-revision.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractAppShellUrls,
  normalizeSwSource,
  computeAppShellFingerprint,
} from "./cache-revision.mjs";

const repoRoot = path.dirname(fileURLToPath(import.meta.url)) + "/../..";
const swSource = await fs.readFile(path.join(repoRoot, "service-worker.js"), "utf8");
const appShellUrls = extractAppShellUrls(swSource);
const normalizedSwSource = normalizeSwSource(swSource);

const fingerprint = computeAppShellFingerprint({ repoRoot, appShellUrls, normalizedSwSource });
console.log(fingerprint);
