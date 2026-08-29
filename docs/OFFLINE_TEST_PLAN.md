# Offline & PWA Test Plan (OFFLINE-1 / OFFLINE-2)

**Document status:** OFFLINE-1 PASS (OFFLINE REGRESSION GATE passed;
genuine external-network browser scenarios below remain individually
marked NOT RUN in this Builder environment for historical accuracy — see
`docs/OFFLINE_V2_ROADMAP.md` OFFLINE-1 section). **OFFLINE-2 PASS. PWA
OFFLINE REGRESSION GATE: PASS.** Automated regression
(`tests/offline2-service-worker.test.mjs` 26/26,
`tests/offline2-baseline-parity.test.mjs` 12/12) and genuine manual
browser full-offline validation (performed by the Supervisor/user) both
passed — see the OFFLINE-2 scenario list below for the per-scenario
record. **V2 — Offline & PWA Readiness workstream: COMPLETE.**

**Baseline commit:** `5c6482b`. The retained baseline fixture
(`tests/fixtures/offline1-baseline-5c6482b.json`) was captured by
actually executing the pipeline against production modules checked out
at `5c6482b` in a temporary detached worktree — see
`tests/fixtures/offline1-baseline-5c6482b.PROVENANCE.md` for the full
capture record. **OFFLINE-1 implementation commit (base):** `6165493`.
**OFFLINE-2 baseline commit:** `c2e1f93` (the approved OFFLINE-1
implementation commit). The retained OFFLINE-2 baseline fixture
(`tests/fixtures/offline2-baseline-c2e1f93.json`) was captured directly
from this commit's clean working tree before any OFFLINE-2 file was
created or edited — see
`tests/fixtures/offline2-baseline-c2e1f93.PROVENANCE.md`.

This document defines the test scenarios required to pass the OFFLINE
REGRESSION GATE (after OFFLINE-1) and the PWA OFFLINE REGRESSION GATE
(after OFFLINE-2) in `docs/OFFLINE_V2_ROADMAP.md`. It does not itself
authorize implementation of OFFLINE-1 or OFFLINE-2.

## Exact-parity requirement (applies to every scenario below)

**Baseline chain:**

- **OFFLINE-1 gate baseline:** the pre-OFFLINE-1 baseline (`5c6482b`).
- **OFFLINE-2 gate baseline:** the *approved OFFLINE-1 gate result*,
  captured and retained once OFFLINE-1 passes, is the primary comparison
  point for OFFLINE-2 — not `5c6482b` directly. The one permitted
  Contractor difference (defined below) is authorized by OFFLINE-1 and
  legitimately persists unchanged into OFFLINE-2; comparing OFFLINE-2
  straight against `5c6482b` would misclassify that already-approved
  Contractor change as a new regression. All protected non-Contractor
  behavior in the OFFLINE-1 approved state is, by construction, still
  identical to `5c6482b` — so this chained baseline does not weaken
  traceability back to `5c6482b` for anything except the one permitted
  Contractor difference.

**PASS CRITERIA** — for every OFFLINE-1 scenario, HYNC, SLNC, and ESG
cleaning results, including TSV output, must be identical to the
OFFLINE-1 gate baseline (`5c6482b`) run against the same source files,
**except for the one narrow, explicitly permitted Contractor difference
defined below.** For every OFFLINE-2 scenario, results must be identical
to the OFFLINE-2 gate baseline (the approved OFFLINE-1 gate result) —
**zero new differences of any kind, Contractor included** — and protected
non-Contractor behavior must remain traceable to `5c6482b`. This applies
at every level: in-app tables, the Operational Summary/Overview, and
copied TSV text (both Copy This Profile and Copy All Groups).

### Always identical (no permitted difference, any phase)

Identical to the phase's own gate baseline above (`5c6482b` for
OFFLINE-1; the approved OFFLINE-1 gate result for OFFLINE-2), in every
scenario, with no exception:

- TSV structure: row count, row order, and the presence/absence of a
  header row.
- TSV/output column order (the approved column schema).
- TSV formatting: delimiter, decimal formatting, quoting/escaping — byte-
  for-byte identical.
- Accepted raw/detail row count.
- Clean row count.
- Lost-row behavior (which rows are excluded, and why).
- Skipped-row behavior (non-detail/report rows).
- Net tonnage (per row and per group total).
- TANGGAL (report date).
- Shift (declared-bucket value).
- Datetime (row-level timestamp column).
- NO.NOTA.
- NO. DT.
- PILE ID.
- Source.
- Grade.
- Duplicate validation (NO.NOTA) results.
- Weight integrity validation (D010) results.
- Low-net validation (D012) results.
- `js/core/readiness.js` itself (the readiness algorithm/logic) — never
  modified by this workstream. Readiness/copy-gating *outcome* per group
  is not in this always-identical list — see "Readiness/copy-gating: a
  permitted direct effect of the Contractor difference" below, which is
  the sole, narrow exception, exactly mirroring why Contractor itself is
  not in this list either.

### Contractor: the one permitted difference, authorized by OFFLINE-1

**Contractor is the single exception. It is authorized only by
OFFLINE-1** — no other phase introduces a *new* Contractor difference —
**but the approved OFFLINE-1 Contractor state is itself the OFFLINE-2
baseline (see "Baseline chain" above), so it legitimately persists
unchanged through OFFLINE-2.** The Contractor *value* for a given row's
TSV cell (and the corresponding
Operational Summary/Overview display) may differ from the pre-OFFLINE-1
baseline **if and only if**:

- that row's DT ID was "Unmatched" at baseline `5c6482b` (because the
  bundled `data/default-list-dt.json` was `[]`), **and**
- the OFFLINE-1 real bundled List DT snapshot legitimately resolves that
  same DT ID to a real contractor.

When this condition holds:

- The Contractor cell's *text content* is expected to differ (baseline
  "Unmatched" → resolved contractor name) — this is not a TSV structure
  or formatting difference; the cell still occupies the same column
  position, same row, same delimiter placement.
- Downstream counts that are *directly derived from* Contractor
  resolution — unmatched-DT counts, the Unmatched DT Correction table's
  row set, and any Contractor-grouped summary in Additional Breakdown —
  may change consistently with that same improvement.
- No other column's value and no row's inclusion/exclusion may change as
  a side effect of this Contractor improvement. If a DT resolution change
  appears to affect anything outside Contractor, its directly-derived
  counts, and readiness/copy-gating (below), that is a regression, not a
  permitted difference.

#### Readiness/copy-gating: a permitted direct effect of the Contractor difference

**Supervisor decision (post-implementation clarification):** the original
wording above this section previously said "no readiness/copy-gating
outcome may change as a side effect of this Contractor improvement." That
was too strict and is now corrected — `computeGroupReadiness()`
(`js/core/readiness.js`, never modified by this workstream) is a pure,
deterministic function of the same validation counts already covered
above, including `unmatchedDtCount`. Once `unmatchedDtCount` is legitimately
permitted to improve, a group's readiness/copy-gating outcome improving
*as the direct, deterministic result of that same drop* is not a side
effect to guard against — it is the intended, unavoidable consequence of
the permitted Contractor resolution, and is now explicitly authorized.
The distinction that actually matters:

- **PERMITTED DIRECT EFFECT:** a legitimate Unmatched→resolved Contractor
  transition removes an `unmatchedDtCount` blocker for a group, and that
  group's readiness/copy-gating outcome improves (e.g.
  `ACTION_REQUIRED` → `READY_WITH_INFO`) as a result — provided every
  *other* blocking-relevant validation count for that group (weight
  integrity, low-net, duplicate NO.NOTA, missing Source/Grade, PILE ID/
  Source conflicts, lost rows) is unchanged from the baseline, and
  `js/core/readiness.js` itself is unmodified.
- **REGRESSION:** readiness/copy-gating changes for any reason *other*
  than a legitimate `unmatchedDtCount` improvement for that same group —
  e.g. a different blocking category changed, a group with no Contractor
  improvement still saw its readiness change, or `js/core/readiness.js`
  was itself modified.

A readiness change is evidence-checked, not merely asserted: it must be
traceable to `unmatchedDtCount` strictly decreasing for that group with
every other validation count identical — see
`tests/offline1-baseline-parity.test.mjs`, which asserts exactly this for
every group.

A row whose DT ID was already matched at `5c6482b`, or that remains
Unmatched under the new bundled snapshot, must show byte-identical
Contractor output to `5c6482b`. **Any Contractor difference from
`5c6482b` not explained by an Unmatched→resolved transition is a
regression and fails the OFFLINE REGRESSION GATE.** Once OFFLINE-1's
Contractor state is approved, it becomes fixed: **every OFFLINE-2
scenario's Contractor output must be byte-identical to the approved
OFFLINE-1 state — zero further Contractor differences are permitted in
OFFLINE-2 or any later phase.** Any difference in any other field, in any
scenario, in any phase, is a regression and fails the gate — OFFLINE-2
introduces no new permitted differences of any kind, Contractor included.

**Evidence to collect for every scenario:**

- The exact source file(s) used (filename + checksum or copy retained).
- Screenshot or saved TSV output of Overview and every profile tab
  reached.
- Browser DevTools Network tab state (confirming actual network
  condition, not just an assumed one).
- Browser DevTools Application tab state for `localStorage` and (for
  OFFLINE-2) Cache Storage/Service Worker status.
- Console log (confirming no blocking JS errors).
- Tester name and date.

## OFFLINE-1 scenarios

### Scenario A — Existing browser with valid List DT cache

- **Setup:** browser profile that has previously run **Update List DT**
  successfully; `localStorage` List DT cache is populated.
- **Action:** upload HYNC/SLNC/ESG sample files, run cleaning.
- **PASS CRITERIA:** cache is used (List DT bar shows source `cache`,
  matches current behavior); bundled snapshot is not consulted; exact
  parity per above.
- **Status: NOT RUN as a browser scenario** (no browser tooling available
  in this Builder environment). **Equivalent verified:**
  `tests/offline1-list-dt.test.mjs` scenario B1 — a non-empty
  `localStorage` cache deterministically wins over the bundled snapshot
  for the same normalized DT, via the unmodified `js/core/list-dt-
  manager.js`.

### Scenario B — Fresh browser/profile with no List DT cache

- **Setup:** a browser profile/private window with no prior
  `localStorage` for this app's origin.
- **Action:** upload HYNC/SLNC/ESG sample files, run cleaning without
  calling Update List DT.
- **PASS CRITERIA:** bundled `data/default-list-dt.json` (now populated
  by OFFLINE-1) is used (List DT bar shows source `bundled`); contractor
  matches reflect the real bundled data; all other fields at exact
  parity.
- **Status: NOT RUN as a browser scenario** (no browser tooling
  available). **Equivalent verified:** `tests/offline1-list-dt.test.mjs`
  scenario C1 (bundled source used with no cache, known DTs resolve) plus
  the full-pipeline `tests/offline1-baseline-parity.test.mjs` against the
  three real reference sample files — bundled snapshot resolved 337/337
  HYNC, 109/109 SLNC, and 224/224 ESG previously-Unmatched rows, with
  every other field at exact parity to the `5c6482b` baseline.

### Scenario C — External network disabled, local origin still reachable

- **Setup:** disconnect external internet/Wi-Fi/Ethernet (or otherwise
  make the WAN and the Google Apps Script endpoint unreachable) while
  preserving loopback/localhost access, so the app's local HTTP origin
  (e.g. the current Live Server setup) remains reachable — not merely
  leaving Update List DT unclicked (see "Note on false offline success"
  below for why this distinction matters). Do **not** use Chrome DevTools
  "Offline" (or any condition that also blocks localhost fetches) as an
  unconditional requirement here: OFFLINE-1 does not yet include a
  Service Worker, so the application shell is not required to
  cold-boot/reload while the browser blocks all HTTP requests. That full
  request-layer isolation, including the local origin, is OFFLINE-2's
  validation target (see "Complete network disconnection" under
  OFFLINE-2 scenarios below). If DevTools "Offline" is used anyway,
  explicitly verify the local HTTP origin remains reachable while the
  external Google endpoint is unreachable.
- **Action:** load the app (already available locally via the current
  local HTTP origin/Live Server setup), upload files, run cleaning,
  attempt Update List DT (expected to fail cleanly), copy TSV.
  Skipped-row and lost-row behavior, tonnage, and every other protected
  field are still at exact parity.
- **PASS CRITERIA:** cleaning succeeds with the external network
  unavailable; Update List DT fails with the existing non-blocking
  failure message (`js/core/list-dt-manager.js` failure path); TSV copy
  works; exact parity otherwise.
- **Status: NOT RUN** — this scenario requires a real browser plus a
  verified external-network-disabled/local-origin-reachable condition;
  neither is available in this Builder environment (no browser
  automation, no ability to genuinely sever external network reachability
  while confirming localhost stays up). **Equivalent verified at the code
  level only:** `tests/offline1-list-dt.test.mjs` scenario E1 confirms
  `loadListDt()` never calls the Google Apps Script endpoint on its own —
  cleaning's List DT dependency is satisfiable with zero network calls.
  This does **not** substitute for a genuine external-network-disabled
  manual run, which remains outstanding before the OFFLINE REGRESSION
  GATE can be fully signed off.

### Scenario D — Google Apps Script endpoint unavailable

- **Setup:** network reachable, but the configured `listDtEndpoint` in
  `config/app-config.json` is unreachable (e.g. endpoint down, DNS
  failure, or a deliberately wrong test URL).
- **Action:** click Update List DT and Sync Pending DT.
- **PASS CRITERIA:** both fail cleanly with the existing "Saved locally,
  pending Google Sheet sync" / update-failure messaging; cleaning is
  unaffected; no fake-success state.
- **Status: NOT RUN** (no browser tooling available). `js/core/list-dt-
  manager.js`'s failure-handling code path (`syncDtMappingsToGoogleSheet`,
  `refreshFromEndpointInBackground`) was not modified by OFFLINE-1.

### Scenario E — localStorage cache unavailable/cleared

- **Setup:** clear site data for the app's origin mid-session, or run in
  a mode where `localStorage` throws (e.g. private browsing with storage
  blocked).
- **Action:** reload, upload files, run cleaning.
- **PASS CRITERIA:** app falls back to bundled List DT without a fatal
  error; pending-sync queue starts empty (expected, since it was
  storage-backed); no cleaning-blocking crash.
- **Status: NOT RUN as a browser scenario** (no browser tooling
  available). **Equivalent verified:** `js/core/list-dt-manager.js`'s
  `readLocalStorageCache()`/`readPendingSync()` already wrap
  `localStorage` access in `try/catch` and return a safe empty value on
  any throw (unmodified by OFFLINE-1); `tests/offline1-list-dt.test.mjs`
  scenario C1 exercises the equivalent no-cache fallback path (falls back
  to bundled without error).

### Scenario F — Bundled List DT fallback

- **Setup:** no cache (Scenario B conditions).
- **Action:** confirm every contractor resolvable from the OFFLINE-1
  bundled snapshot resolves correctly, and every contractor not in the
  bundled snapshot still shows "Unmatched" (not a crash or blank value).
- **PASS CRITERIA:** matches expected content of the OFFLINE-1 bundled
  snapshot exactly; unmatched rows behave identically to current
  Unmatched-DT handling.
- **Status: RUN (automated, deterministic equivalent).**
  `tests/offline1-list-dt.test.mjs` scenarios A1–A5 (snapshot integrity:
  non-empty, every record valid, only `dt_id`/`contractor` fields, no
  normalized conflicts, deterministic `dt_id`-ascending order), C1
  (bundled resolves a known DT), and D1 (a DT absent from the bundled
  snapshot still resolves to `"Unmatched"`, never blank or an error) —
  9/9 PASS. `tests/offline1-baseline-parity.test.mjs` additionally
  confirms this holds across all 670 rows of the three real reference
  sample files, not just synthetic cases.

### Scenario G — Manual List DT update failure

- **Setup:** as Scenario D, but specifically verify the List DT bar's
  displayed source/counts do not change on a failed update.
- **PASS CRITERIA:** List DT bar retains its pre-attempt source/count/
  last-updated values; failure is surfaced without silently resetting to
  bundled or clearing the cache.
- **Status: NOT RUN** (no browser tooling available). `js/core/list-dt-
  manager.js`'s `refreshFromEndpointInBackground()` only calls
  `writeLocalStorageCache()`/clears the in-memory `cached` variable
  inside its success branch (`response.ok` and a non-empty
  `records`array) — the failure branches return `{ ok: false, reason }`
  without touching cache/source state, unmodified by OFFLINE-1.

### Scenario H — Pending DT corrections remain locally usable while offline

- **Setup:** enter one or more Unmatched DT Correction entries while
  online (creating pending-sync entries), then go offline (Scenario C
  conditions) without syncing.
- **Action:** re-run cleaning offline; confirm the corrected contractor
  values are applied to matching rows.
- **PASS CRITERIA:** corrections already applied locally continue to
  affect cleaning output while offline; pending-sync count is unchanged
  and accurately reflects unsynced entries; no attempt to sync is made
  automatically.
- **Status: NOT RUN** (no browser tooling available; depends on Scenario
  C's real network condition). **Equivalent verified:** the existing
  `tests/dt-correction.test.mjs` (tests C/D/E/F, unmodified by OFFLINE-1)
  already proves a locally-applied correction remains usable for matching
  even when the Google Sheet sync never succeeds — the same code path
  Scenario H exercises, just not under a verified offline network
  condition.

## OFFLINE-2 scenarios (manifest + service worker IMPLEMENTED — PASS)

`manifest.json`, `service-worker.js`, and
`js/core/service-worker-registration.js` have landed (OFFLINE-2). Every
scenario below has a code-level/structural automated equivalent in
`tests/offline2-service-worker.test.mjs` (26/26 PASS) and/or
`tests/offline2-baseline-parity.test.mjs` (12/12 PASS) — cited per
scenario — **and** has now been run and passed as a genuine browser
scenario by the Supervisor/user (this Builder environment itself has no
browser or network-condition automation tooling, so the browser-level
execution was necessarily performed outside it). The **PWA OFFLINE
REGRESSION GATE is recorded PASS** on this basis.

- **First online load** — service worker installs on first visit;
  application shell is precached; app functions identically to
  pre-OFFLINE-2 behavior on this load. **PASS (manual browser + automated).**
  Structurally verified: install atomically calls
  `cache.addAll(APP_SHELL_URLS)` (`tests/offline2-service-worker.test.mjs`
  "D. update safety"); pipeline output is unaffected
  (`tests/offline2-baseline-parity.test.mjs`).
- **Service worker installation** — installation completes without
  blocking the current page session (no forced reload mid-session).
  **PASS.** Structurally verified: no `self.skipWaiting()`, no forced
  `clients.claim()`.
- **Application close** — closing and reopening the app (or tab) does not
  lose the installed service worker/cache. **PASS** (verified in a real
  browser's persisted Cache Storage).
- **Complete network disconnection** — OS-level network disabled; app
  still loads and functions from cache. **PASS** (verified in a real
  browser with a confirmed network-disabled condition, per "Note on false
  offline success" below).
- **Browser restart** — service worker/cache survives a full browser
  restart. **PASS.**
- **Offline reopen** — app reopened fully offline from a fresh tab loads
  the cached application shell correctly. **PASS.** Structurally verified:
  navigation requests are answered from the current revision's cached
  `index.html` (`tests/offline2-service-worker.test.mjs` fetch-handler
  checks).
- **Offline reload** — a hard reload (Ctrl+F5 equivalent) while offline
  does not break the app or fall back to a network error page. **PASS.**
- **HYNC cleaning offline** — exact parity per the shared criteria above,
  run fully offline post-OFFLINE-2. **PASS (manual browser + automated
  equivalent):** `tests/offline2-baseline-parity.test.mjs` — 337 rows,
  14,421.19 t, byte-identical output including Contractor, against
  `tests/fixtures/offline2-baseline-c2e1f93.json`; genuine browser offline
  run confirmed the same figures.
- **SLNC cleaning offline** — same as above. **PASS:** 109 rows,
  4,776.33 t, byte-identical, confirmed both automated and in-browser.
- **ESG cleaning offline** — same as above. **PASS:** 224 rows,
  10,547.46 t, byte-identical, confirmed both automated and in-browser.
- **TSV copy offline** — Copy This Profile / Copy All Groups work
  identically offline. **PASS** (verified in-browser; the underlying TSV
  text itself is verified byte-identical by
  `tests/offline2-baseline-parity.test.mjs`).
- **Cached List DT use** — `localStorage` List DT cache still takes
  priority over the bundled snapshot; service worker caching of the
  application shell does not interfere with or duplicate this mechanism.
  **PASS.** `js/core/list-dt-manager.js` was not modified by OFFLINE-2
  (§"Protected files/behavior" in `docs/OFFLINE_V2_ROADMAP.md`); the
  service worker only makes the bundled `data/default-list-dt.json` fetch
  succeed offline, never reads or writes `localStorage`.
- **Bundled List DT fallback** — bundled snapshot still used correctly
  when no cache exists, served from the service worker's precache like
  the rest of the application shell. **PASS.** Structurally verified:
  `./data/default-list-dt.json` is in `APP_SHELL_URLS`
  (`tests/offline2-service-worker.test.mjs` "B. app-shell coverage",
  R-08/R-09 check).
- **Honest Update List DT failure while offline** — clicking Update List
  DT while fully offline fails cleanly with the existing non-blocking
  failure message; existing List DT state is preserved; no fake cached
  success. **PASS.** Structurally verified: the fetch handler bails out on
  any cross-origin request (the Google Apps Script origin) before any
  cache lookup, so no cached/synthesized response can exist for it
  (`tests/offline2-service-worker.test.mjs` "C. exclusions").
- **Service-worker update lifecycle (Revision A → B)** — a new deployed
  version's service worker installs alongside the old one without
  immediately taking over a page that's mid-session (no operational work
  interrupted — see `docs/OFFLINE_RISK_REGISTER.md` risk on
  update-during-active-work). **PASS.** Verified in-browser: a harmless
  app-shell-only change with a new `CACHE_REVISION` (temporary local
  Revision B) installed and entered WAITING while an open page continued
  under Revision A uninterrupted; Revision B activated only after all
  Revision-A-controlled pages closed; the Revision A cache was then
  deleted; no mixed old/new asset serving was observed at any point; no
  temporary test content was left in the final source (verified — see
  step 1 of the OFFLINE-2 final cleanup). Structurally guaranteed by the
  code: no forced activation exists at all (no `skipWaiting`/
  `clients.claim`).
- **Stale-cache prevention** — after an update, the next load (or an
  explicit user action, per whatever activation strategy OFFLINE-2
  chooses) serves the new version's assets, not a mix of old and new.
  **PASS.** Structurally verified: the fetch handler only ever reads from
  `caches.open(CACHE_NAME)` for the worker's own current revision — never
  an unscoped `caches.match()` that could return a cross-revision asset
  (`tests/offline2-service-worker.test.mjs`).
- **Old-cache cleanup** — previous versioned caches are deleted once the
  new version has activated; Cache Storage does not grow unbounded across
  repeated deploys. **PASS.** Confirmed in-browser during the Revision
  A → B test above (old cache deleted after activation). Structurally
  verified: `activate` deletes every cache name starting with
  `CACHE_PREFIX` other than the current `CACHE_NAME`, and nothing else.
- **New-version activation** — after activation, `config/app-config.json`,
  application JS, and CSS are all from the same deployed version — never
  a mismatched combination (see "mixed application versions" risk).
  **PASS.** Structurally verified: one atomic
  `CACHE_PREFIX`+`CACHE_REVISION` cache holds the entire app-shell set as
  a single unit; there is no per-file cache versioning, and
  `CACHE_REVISION` is tied to a deterministic fingerprint of every
  precached file plus the worker's own strategy source
  (`tests/offline2-service-worker.test.mjs` "E. cache revision
  integrity") — an inconsistent/partial shell cannot be declared without
  the test failing first.
- **Cache privacy** — after an upload+clean+copy cycle, Cache Storage
  contains no Excel filename/content, no result payload, no TSV data.
  **PASS.** Verified in-browser by inspecting Cache Storage contents.
  Structurally verified: the fetch handler only ever answers a fixed,
  explicit allowlist (`APP_SHELL_URLS`) plus navigation requests, and file
  reading itself never goes through `fetch()` in the first place
  (FileReader/`arrayBuffer()` only) — there is no path by which uploaded
  or generated data could reach Cache Storage.

**Note on false offline success (applies to all OFFLINE-1 and OFFLINE-2
scenarios):** a browser's ordinary HTTP cache (distinct from Cache
Storage/service worker) can make an app appear to "work offline" even
with no service worker installed, if the tester merely leaves the
network idle rather than actually severing it. Every offline scenario
above must use a verified network-disabled condition appropriate to its
phase — for OFFLINE-1, verified external-network/WAN and Google-endpoint
unreachability with the local HTTP origin confirmed still reachable; for
OFFLINE-2, verified full request-layer isolation (DevTools "Offline"
throttling confirmed active, or OS-level adapter disabled, checked in the
Network tab) — not just "I didn't click anything that needs network."

## Regression comparison method

For both gates, comparison is against the same fixed reference sample
files already used for parity validation (`samples/hync-sample.xlsx`,
`samples/slnc-sample.xlsx`, `samples/esg-sample.xlsx`, per
`docs/LEGACY_PARITY_PROFILE.md`) plus, where available, real operational
files already validated during the v0.2 Operational Pilot
(`docs/PILOT_VALIDATION_LOG.md`).

- The pre-OFFLINE-1 baseline run (at commit `5c6482b`) was captured and
  retained before OFFLINE-1 began
  (`tests/fixtures/offline1-baseline-5c6482b.json`), so the OFFLINE
  REGRESSION GATE has a fixed reference point rather than relying on
  memory or re-deriving expected values.
- The approved OFFLINE-1 gate result was captured and retained at commit
  `c2e1f93` (`tests/fixtures/offline2-baseline-c2e1f93.json`, see
  `tests/fixtures/offline2-baseline-c2e1f93.PROVENANCE.md`), so the PWA
  OFFLINE REGRESSION GATE has its own fixed reference point. This is the
  OFFLINE-2 baseline described in "Exact-parity requirement" above,
  superseding a direct comparison to `5c6482b` for OFFLINE-2 — verified by
  `tests/offline2-baseline-parity.test.mjs` (12/12 PASS).
