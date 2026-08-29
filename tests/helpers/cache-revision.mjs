// Deterministic app-shell fingerprint helper shared by
// tests/offline2-service-worker.test.mjs and the manual
// tests/helpers/print-cache-revision.mjs dev tool. Duplicates no caching
// logic of its own — it only reads service-worker.js as text and hashes
// the exact files it declares.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function extractConstString(source, constName) {
  const match = source.match(new RegExp(`const ${constName} = "([^"]*)";`));
  if (!match) throw new Error(`${constName} not found in service-worker.js`);
  return match[1];
}

export function extractAppShellUrls(source) {
  const match = source.match(/const APP_SHELL_URLS = (\[[\s\S]*?\]);/);
  if (!match) throw new Error("APP_SHELL_URLS not found in service-worker.js");
  return JSON.parse(match[1]);
}

// Removes the CACHE_REVISION literal's value so the fingerprint is
// computed over the worker's caching/lifecycle *strategy*, not over the
// revision string itself (which would make the fingerprint depend on
// itself).
export function normalizeSwSource(source) {
  return source.replace(/const CACHE_REVISION = "[^"]*";/, 'const CACHE_REVISION = "";');
}

// Computes one deterministic hex fingerprint over:
//   - every app-shell file's own content (path + sha256, sorted by path
//     so array order in service-worker.js doesn't affect the hash), and
//   - the service worker's own source with the CACHE_REVISION literal
//     blanked out.
// Changing any precached file's bytes, adding/removing a precached file,
// or changing any other part of service-worker.js's strategy changes this
// value.
export function computeAppShellFingerprint({ repoRoot, appShellUrls, normalizedSwSource }) {
  const fileDigests = appShellUrls
    .map((url) => {
      const relPath = url.replace(/^\.\//, "");
      const absPath = path.join(repoRoot, relPath);
      const bytes = fs.readFileSync(absPath);
      return `${relPath}:${sha256Hex(bytes)}`;
    })
    .sort()
    .join("\n");

  const swDigest = sha256Hex(Buffer.from(normalizedSwSource, "utf8"));

  return sha256Hex(Buffer.from(`${fileDigests}\nSW:${swDigest}`, "utf8")).slice(0, 16);
}
