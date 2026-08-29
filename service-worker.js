// OFFLINE-2 application-shell service worker.
//
// Scope and design constraints (docs/OFFLINE_V2_ROADMAP.md OFFLINE-2,
// docs/OFFLINE_RISK_REGISTER.md R-05..R-13):
//   - Precaches a FIXED, explicit application-shell asset list
//     (APP_SHELL_URLS below) into one uniquely-named cache per revision.
//     Nothing outside this list is ever written to Cache Storage.
//   - CACHE_REVISION is a cache-fingerprint identifier, NOT the
//     application SemVer (config/app-config.json "version" is the only
//     source of truth for that). It changes whenever the app-shell asset
//     set or this file's own caching/lifecycle strategy changes — see
//     tests/offline2-service-worker.test.mjs and
//     tests/helpers/cache-revision.mjs, which compute this value
//     deterministically from the actual files.
//   - No self.skipWaiting() and no clients.claim(): a newly-installed
//     worker precaches into its own new cache and then waits. It only
//     activates once no page is still controlled by the previous worker
//     (the browser's default lifecycle), so an open operational session
//     is never force-upgraded mid-session and never runs a mix of old and
//     new assets.
//   - Activation deletes only OLD caches under this app's own
//     CACHE_PREFIX; nothing else in Cache Storage is touched.
//   - The fetch handler only intercepts same-origin GET requests that
//     either are a navigation request or exactly match a precached
//     app-shell URL, and always answers from THIS worker's own current
//     revision cache (never a cross-revision or unscoped caches.match()).
//     Every other request (cross-origin — including the Google Apps
//     Script List DT/sync endpoint — non-GET, or any same-origin request
//     not on the app-shell allowlist) is left completely unintercepted,
//     so it goes to the real network exactly as if this worker did not
//     exist. Uploaded Excel files and generated cleaning results never
//     travel through fetch() at all (they are read in-memory via
//     FileReader/arrayBuffer), so they can never reach this cache by
//     construction.

const CACHE_PREFIX = "weighbridge-cleaner-shell-";
const CACHE_REVISION = "c635b8962b197f08";
const CACHE_NAME = CACHE_PREFIX + CACHE_REVISION;

// Fixed, explicit application-shell allowlist. Every entry here is
// resolved relative to this file's own location (the site root) and must
// be a real, same-origin, GET-able static asset required for the app to
// boot and run cleaning fully offline. Do NOT add:
//   - tests/**, docs/**, samples/** (development/documentation only)
//   - the Google Apps Script endpoint (config/app-config.json
//     listDtEndpoint) — see R-10, must remain network-only
//   - uploaded Excel files or generated cleaning results — never cached
// See tests/offline2-service-worker.test.mjs for the automated coverage
// and exclusion checks against this exact list.
const APP_SHELL_URLS = [
  "./index.html",
  "./manifest.json",
  "./css/app.css",
  "./lib/sheetjs/xlsx.full.min.js",
  "./config/app-config.json",
  "./config/shift-rules.json",
  "./data/default-list-dt.json",
  "./assets/icons/weighbridge-cleaner-icon.png",
  "./assets/icons/weighbridge-cleaner-icon-512.png",
  "./js/main.js",
  "./js/core/app-settings.js",
  "./js/core/cleaning-orchestrator.js",
  "./js/core/datetime-utils.js",
  "./js/core/decimal-preference.js",
  "./js/core/excel-reader.js",
  "./js/core/group-key.js",
  "./js/core/list-dt-manager.js",
  "./js/core/low-net-weight-store.js",
  "./js/core/net-weight-validation.js",
  "./js/core/normalizers.js",
  "./js/core/output-formatter.js",
  "./js/core/readiness.js",
  "./js/core/report-builder.js",
  "./js/core/schema-detector.js",
  "./js/core/service-worker-registration.js",
  "./js/core/shift-bucket-validator.js",
  "./js/core/shift-classifier.js",
  "./js/core/tsv-exporter.js",
  "./js/core/validation-engine.js",
  "./js/core/weight-exception-store.js",
  "./js/core/weight-integrity.js",
  "./js/profiles/esg/cleaner.js",
  "./js/profiles/esg/detector.js",
  "./js/profiles/hync/cleaner.js",
  "./js/profiles/hync/detector.js",
  "./js/profiles/slnc/cleaner.js",
  "./js/profiles/slnc/detector.js",
  "./js/ui/action-bar.js",
  "./js/ui/app-nav.js",
  "./js/ui/cleaning-overview-page.js",
  "./js/ui/clipboard-utils.js",
  "./js/ui/decimal-format-selector.js",
  "./js/ui/dt-correction-model.js",
  "./js/ui/dt-correction-panel.js",
  "./js/ui/group-readiness.js",
  "./js/ui/group-status-presentation.js",
  "./js/ui/i18n.js",
  "./js/ui/import-page.js",
  "./js/ui/imported-file-list.js",
  "./js/ui/list-dt-page.js",
  "./js/ui/live-announcer.js",
  "./js/ui/low-net-weight-dialog.js",
  "./js/ui/profile-page.js",
  "./js/ui/result-page.js",
  "./js/ui/scroll-edge-indicators.js",
  "./js/ui/settings-panel.js",
  "./js/ui/shift-bucket.js",
  "./js/ui/table-utils.js",
  "./js/ui/theme-selector.js",
  "./js/ui/validation-panel.js",
  "./js/ui/view-all-modal.js",
  "./js/ui/weight-exception-dialog.js",
  "./js/ui/wrong-bucket-modal.js"
];

const APP_SHELL_ABSOLUTE_URLS = APP_SHELL_URLS.map((url) => new URL(url, self.location.href).href);
const INDEX_ABSOLUTE_URL = new URL("./index.html", self.location.href).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // cache.addAll() is atomic: if any single asset fails to fetch/cache,
      // the whole call rejects, install fails, and this worker never
      // reaches the activate/waiting state — the previously-active worker
      // and its cache are left completely untouched.
      await cache.addAll(APP_SHELL_URLS);
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const existingCacheNames = await caches.keys();
      await Promise.all(
        existingCacheNames
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const isNavigation = request.mode === "navigate";
  const isKnownShellAsset = APP_SHELL_ABSOLUTE_URLS.includes(request.url);
  if (!isNavigation && !isKnownShellAsset) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      if (isNavigation) {
        const cachedIndex = await cache.match(INDEX_ABSOLUTE_URL);
        if (cachedIndex) return cachedIndex;
      }
      const cachedAsset = await cache.match(request.url);
      if (cachedAsset) return cachedAsset;
      // Not present in this revision's own cache (e.g. a first-ever load
      // before install completed) — fall through to the network rather
      // than reaching into any other cache/revision.
      return fetch(request);
    })()
  );
});
