// OFFLINE-2 structural/policy regression tests for manifest.json and
// service-worker.js. Plain Node, no framework, no browser — run with
//   node tests/offline2-service-worker.test.mjs
//
// Covers docs/OFFLINE_V2_ROADMAP.md OFFLINE-2 requirements: manifest
// integrity, full app-shell coverage, cache-revision integrity (tied to
// actual file contents so drift is caught automatically), update-lifecycle
// safety (no skipWaiting/forced clients.claim, prefix-scoped cleanup,
// current-cache-only fetch matching), and registration non-blocking-ness.

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractConstString,
  extractAppShellUrls,
  normalizeSwSource,
  computeAppShellFingerprint,
} from "./helpers/cache-revision.mjs";

const repoRoot = path.dirname(fileURLToPath(import.meta.url)) + "/..";

async function readRepoFile(relPath) {
  return fs.readFile(path.join(repoRoot, relPath), "utf8");
}

async function repoFileExists(relPath) {
  try {
    await fs.access(path.join(repoRoot, relPath));
    return true;
  } catch {
    return false;
  }
}

const manifestSource = await readRepoFile("manifest.json");
const manifest = JSON.parse(manifestSource);
const swSource = await readRepoFile("service-worker.js");
const appShellUrls = extractAppShellUrls(swSource);
const cacheRevision = extractConstString(swSource, "CACHE_REVISION");
const cachePrefix = extractConstString(swSource, "CACHE_PREFIX");
const registrationSource = await readRepoFile("js/core/service-worker-registration.js");
const mainSource = await readRepoFile("js/main.js");

// service-worker.js's own descriptive comments intentionally name the
// exact APIs this worker must NOT call (e.g. "no self.skipWaiting()"), so
// a plain substring search over the raw source would false-positive on
// prose, not code. Strip comments first so these checks only see actual
// executable statements. Safe here because the file contains no string
// literal that itself includes "//" or "/*" (verified: no "://" URLs are
// embedded in service-worker.js — the Google endpoint lives only in
// config/app-config.json, never hardcoded here).
function stripJsComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}
const swCode = stripJsComments(swSource);

const results = [];
function test(name, fn) {
  results.push({ name, fn });
}

// ---------------------------------------------------------------------
// A. Manifest integrity
// ---------------------------------------------------------------------

test("manifest.json is valid JSON with the expected app identity", () => {
  assert.equal(manifest.name, "Weighbridge Data Cleaner");
  assert.ok(typeof manifest.short_name === "string" && manifest.short_name.length > 0);
  assert.equal(manifest.display, "standalone");
});

test("manifest start_url and scope are relative (portable, no fixed origin)", () => {
  assert.ok(!/^[a-z]+:\/\//i.test(manifest.start_url), "start_url must not be absolute/external");
  assert.ok(!/^[a-z]+:\/\//i.test(manifest.scope), "scope must not be absolute/external");
  assert.ok(manifest.start_url.startsWith("./"), "start_url should be relative to app root");
  assert.ok(manifest.scope.startsWith("./"), "scope should be relative to app root");
});

test("manifest icons are local PNGs only, no external/CDN URLs", () => {
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
  for (const icon of manifest.icons) {
    assert.ok(!/^[a-z]+:\/\//i.test(icon.src), `icon src must be local, not external: ${icon.src}`);
    assert.equal(icon.type, "image/png");
  }
});

test("manifest declares 192x192 and 512x512 icon sizes required for installability", () => {
  const sizes = manifest.icons.map((icon) => icon.sizes);
  assert.ok(sizes.includes("192x192"), "manifest must declare a 192x192 icon");
  assert.ok(sizes.includes("512x512"), "manifest must declare a 512x512 icon");
});

test("every manifest icon file actually exists in the repo", async () => {
  for (const icon of manifest.icons) {
    const exists = await repoFileExists(icon.src.replace(/^\.\//, ""));
    assert.ok(exists, `manifest icon file missing: ${icon.src}`);
  }
});

test("manifest icon declared sizes match each PNG file's real IHDR dimensions", async () => {
  for (const icon of manifest.icons) {
    const buf = await fs.readFile(path.join(repoRoot, icon.src.replace(/^\.\//, "")));
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    assert.equal(icon.sizes, `${width}x${height}`, `${icon.src} real dimensions must match declared sizes`);
  }
});

// ---------------------------------------------------------------------
// B. App-shell coverage
// ---------------------------------------------------------------------

test("app shell includes index.html, css/app.css, manifest.json, SheetJS", () => {
  assert.ok(appShellUrls.includes("./index.html"));
  assert.ok(appShellUrls.includes("./css/app.css"));
  assert.ok(appShellUrls.includes("./manifest.json"));
  assert.ok(appShellUrls.includes("./lib/sheetjs/xlsx.full.min.js"));
});

test("app shell includes app-config.json, shift-rules.json, and bundled List DT (R-08/R-09)", () => {
  assert.ok(appShellUrls.includes("./config/app-config.json"));
  assert.ok(appShellUrls.includes("./config/shift-rules.json"));
  assert.ok(appShellUrls.includes("./data/default-list-dt.json"));
});

test("app shell includes every required icon referenced by the manifest", () => {
  for (const icon of manifest.icons) {
    assert.ok(appShellUrls.includes(icon.src), `app shell must include manifest icon ${icon.src}`);
  }
});

test("app shell includes every tracked runtime js/**/*.js file", async () => {
  const { execFileSync } = await import("node:child_process");
  const output = execFileSync("git", ["ls-files", "js/*.js", "js/**/*.js"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const trackedFiles = output.split("\n").map((line) => line.trim()).filter(Boolean);
  assert.ok(trackedFiles.length > 0, "expected at least one tracked js file");
  for (const file of trackedFiles) {
    const url = "./" + file.replace(/\\/g, "/");
    assert.ok(appShellUrls.includes(url), `app shell must include tracked runtime file ${url}`);
  }
});

test("every declared app-shell URL actually exists on disk", async () => {
  for (const url of appShellUrls) {
    const exists = await repoFileExists(url.replace(/^\.\//, ""));
    assert.ok(exists, `declared app-shell URL does not exist: ${url}`);
  }
});

// ---------------------------------------------------------------------
// C. Exclusions
// ---------------------------------------------------------------------

test("app shell never includes tests/docs/samples paths", () => {
  for (const url of appShellUrls) {
    assert.ok(!url.includes("tests/"), `app shell must not include tests/: ${url}`);
    assert.ok(!url.includes("docs/"), `app shell must not include docs/: ${url}`);
    assert.ok(!url.includes("samples/"), `app shell must not include samples/: ${url}`);
  }
});

test("app shell never includes the Google Apps Script endpoint or any http(s):// URL", async () => {
  const appConfig = JSON.parse(await readRepoFile("config/app-config.json"));
  for (const url of appShellUrls) {
    assert.ok(!/^https?:\/\//i.test(url), `app-shell URL must be local/relative, not absolute: ${url}`);
    assert.ok(!url.includes(appConfig.listDtEndpoint), `app shell must never include the List DT endpoint: ${url}`);
  }
  assert.ok(!swSource.includes(appConfig.listDtEndpoint), "service-worker.js source must never reference the List DT endpoint");
});

test("service worker does not implement a broad cache-on-every-request strategy", () => {
  // A naive "cache everything" implementation would call cache.put()/
  // cache.add() from inside the fetch handler for arbitrary requests, or
  // would use caches.match() without restricting to APP_SHELL_ABSOLUTE_URLS.
  // This worker only ever writes to its cache during install() via
  // cache.addAll(APP_SHELL_URLS) — assert no other cache-write call exists.
  const fetchHandlerMatch = swCode.match(/self\.addEventListener\("fetch"[\s\S]*$/);
  assert.ok(fetchHandlerMatch, "expected a fetch event listener");
  const fetchHandlerSource = fetchHandlerMatch[0];
  assert.ok(!fetchHandlerSource.includes("cache.put("), "fetch handler must never write to Cache Storage");
  assert.ok(!fetchHandlerSource.includes("cache.add("), "fetch handler must never write to Cache Storage");
  assert.ok(
    fetchHandlerSource.includes("APP_SHELL_ABSOLUTE_URLS.includes(request.url)"),
    "fetch handler must restrict handling to the known app-shell URL allowlist"
  );
});

test("service worker ignores non-GET and cross-origin requests before any cache lookup", () => {
  const fetchHandlerMatch = swCode.match(/self\.addEventListener\("fetch"[\s\S]*$/)[0];
  assert.ok(/request\.method !== "GET"\)\s*return;/.test(fetchHandlerMatch), "must bail out on non-GET requests");
  assert.ok(
    /requestUrl\.origin !== self\.location\.origin\)\s*return;/.test(fetchHandlerMatch),
    "must bail out on cross-origin requests (so the Google Apps Script endpoint is never intercepted)"
  );
});

// ---------------------------------------------------------------------
// D. Update safety
// ---------------------------------------------------------------------

test("service worker never calls self.skipWaiting()", () => {
  assert.ok(!swCode.includes("skipWaiting"), "self.skipWaiting() must never be used (forces takeover mid-session)");
});

test("service worker never forces clients.claim()", () => {
  assert.ok(!swCode.includes("clients.claim"), "clients.claim() must never be used (forces takeover mid-session)");
});

test("a unique CACHE_REVISION/CACHE_PREFIX pair is declared", () => {
  assert.ok(cacheRevision.length > 0, "CACHE_REVISION must be non-empty");
  assert.ok(cachePrefix.length > 0, "CACHE_PREFIX must be non-empty");
  assert.ok(swSource.includes("CACHE_PREFIX + CACHE_REVISION"), "CACHE_NAME must combine prefix and revision");
});

test("CACHE_REVISION is not the application SemVer (must not read config/app-config.json's version)", async () => {
  const appConfig = JSON.parse(await readRepoFile("config/app-config.json"));
  assert.notEqual(cacheRevision, appConfig.version, "CACHE_REVISION must be a distinct identifier from the app version");
  assert.ok(!swSource.includes(`"${appConfig.version}"`), "service-worker.js must not hardcode the app version as its cache revision");
});

test("old-cache deletion on activate is scoped strictly to this app's CACHE_PREFIX", () => {
  const activateHandlerMatch = swSource.match(/self\.addEventListener\("activate"[\s\S]*?\}\);/);
  assert.ok(activateHandlerMatch, "expected an activate event listener");
  const activateSource = activateHandlerMatch[0];
  assert.ok(activateSource.includes("startsWith(CACHE_PREFIX)"), "activate must only ever delete caches starting with CACHE_PREFIX");
  assert.ok(activateSource.includes("name !== CACHE_NAME"), "activate must never delete the current revision's own cache");
});

test("fetch matching only ever opens/reads THIS worker's current revision cache, never an unscoped caches.match", () => {
  assert.ok(!swCode.includes("caches.match("), "must never call the global caches.match() (could return a stale cross-revision asset)");
  assert.ok(swCode.includes("caches.open(CACHE_NAME)"), "fetch/install/activate must operate on the current-revision cache by name");
});

test("install failure is atomic: cache.addAll used (all-or-nothing), no per-file try/catch that would allow partial install", () => {
  const installHandlerMatch = swSource.match(/self\.addEventListener\("install"[\s\S]*?\}\);/);
  assert.ok(installHandlerMatch, "expected an install event listener");
  assert.ok(installHandlerMatch[0].includes("cache.addAll(APP_SHELL_URLS)"), "install must use atomic cache.addAll()");
});

// ---------------------------------------------------------------------
// E. Cache revision integrity
// ---------------------------------------------------------------------

test("declared CACHE_REVISION matches the deterministic fingerprint of the actual app-shell files + SW strategy", () => {
  const normalizedSwSource = normalizeSwSource(swSource);
  const expectedFingerprint = computeAppShellFingerprint({ repoRoot, appShellUrls, normalizedSwSource });
  assert.equal(
    cacheRevision,
    expectedFingerprint,
    "CACHE_REVISION is stale: an app-shell file or the SW strategy changed without regenerating it " +
      "(run: node tests/helpers/print-cache-revision.mjs)"
  );
});

// ---------------------------------------------------------------------
// F. Registration
// ---------------------------------------------------------------------

test("registration module exists, feature-detects serviceWorker, and swallows failures non-blockingly", () => {
  assert.ok(registrationSource.includes('"serviceWorker" in navigator'), "must feature-detect navigator.serviceWorker");
  assert.ok(registrationSource.includes(".catch("), "registration failure must be caught, not left to reject uncaught");
  assert.ok(!registrationSource.includes("await "), "registration must not be awaited internally in a way that could block callers");
});

test("main.js calls registerServiceWorker() without awaiting it (non-blocking for cleaning startup)", () => {
  assert.ok(mainSource.includes("import { registerServiceWorker }"), "main.js must import the registration bootstrap");
  assert.ok(mainSource.includes("registerServiceWorker();"), "main.js must call registerServiceWorker()");
  assert.ok(!mainSource.includes("await registerServiceWorker()"), "registerServiceWorker() must never be awaited");
});

test("registerServiceWorker() call happens after the main app bootstrap, not before appConfig/runCleaning wiring", () => {
  const registrationCallIndex = mainSource.indexOf("registerServiceWorker();");
  const appConfigLoadIndex = mainSource.indexOf("await loadAppConfig()");
  const resultPageMountIndex = mainSource.indexOf("mountResultPage(");
  assert.ok(registrationCallIndex > appConfigLoadIndex, "registration must be called after app config load");
  assert.ok(registrationCallIndex > resultPageMountIndex, "registration must be called after core UI is mounted");
});

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
