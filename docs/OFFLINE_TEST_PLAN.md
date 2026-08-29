# Offline & PWA Test Plan (OFFLINE-1 / OFFLINE-2)

**Document status:** FROZEN at V2-0 (Documentation & Versioning Freeze) —
PLANNED test plan for future phases. No scenario in this document has
been executed as part of V2-0. V2-0 performs documentation work only.

**Baseline commit:** `5c6482b`.

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
- Readiness/copy-gating outcome per group.

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
- No other column's value, no row's inclusion/exclusion, and no
  readiness/copy-gating outcome may change as a side effect of this
  Contractor improvement. If a DT resolution change appears to affect
  anything outside Contractor and its directly-derived counts, that is a
  regression, not a permitted difference.

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

### Scenario B — Fresh browser/profile with no List DT cache

- **Setup:** a browser profile/private window with no prior
  `localStorage` for this app's origin.
- **Action:** upload HYNC/SLNC/ESG sample files, run cleaning without
  calling Update List DT.
- **PASS CRITERIA:** bundled `data/default-list-dt.json` (now populated
  by OFFLINE-1) is used (List DT bar shows source `bundled`); contractor
  matches reflect the real bundled data; all other fields at exact
  parity.

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

### Scenario D — Google Apps Script endpoint unavailable

- **Setup:** network reachable, but the configured `listDtEndpoint` in
  `config/app-config.json` is unreachable (e.g. endpoint down, DNS
  failure, or a deliberately wrong test URL).
- **Action:** click Update List DT and Sync Pending DT.
- **PASS CRITERIA:** both fail cleanly with the existing "Saved locally,
  pending Google Sheet sync" / update-failure messaging; cleaning is
  unaffected; no fake-success state.

### Scenario E — localStorage cache unavailable/cleared

- **Setup:** clear site data for the app's origin mid-session, or run in
  a mode where `localStorage` throws (e.g. private browsing with storage
  blocked).
- **Action:** reload, upload files, run cleaning.
- **PASS CRITERIA:** app falls back to bundled List DT without a fatal
  error; pending-sync queue starts empty (expected, since it was
  storage-backed); no cleaning-blocking crash.

### Scenario F — Bundled List DT fallback

- **Setup:** no cache (Scenario B conditions).
- **Action:** confirm every contractor resolvable from the OFFLINE-1
  bundled snapshot resolves correctly, and every contractor not in the
  bundled snapshot still shows "Unmatched" (not a crash or blank value).
- **PASS CRITERIA:** matches expected content of the OFFLINE-1 bundled
  snapshot exactly; unmatched rows behave identically to current
  Unmatched-DT handling.

### Scenario G — Manual List DT update failure

- **Setup:** as Scenario D, but specifically verify the List DT bar's
  displayed source/counts do not change on a failed update.
- **PASS CRITERIA:** List DT bar retains its pre-attempt source/count/
  last-updated values; failure is surfaced without silently resetting to
  bundled or clearing the cache.

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

## OFFLINE-2 scenarios (PLANNED, after manifest + service worker land)

- **First online load** — service worker installs on first visit;
  application shell is precached; app functions identically to
  pre-OFFLINE-2 behavior on this load.
- **Service worker installation** — installation completes without
  blocking the current page session (no forced reload mid-session).
- **Application close** — closing and reopening the app (or tab) does not
  lose the installed service worker/cache.
- **Complete network disconnection** — OS-level network disabled; app
  still loads and functions from cache.
- **Browser restart** — service worker/cache survives a full browser
  restart.
- **Offline reopen** — app reopened fully offline from a fresh tab loads
  the cached application shell correctly.
- **Offline reload** — a hard reload (Ctrl+F5 equivalent) while offline
  does not break the app or fall back to a network error page.
- **HYNC cleaning offline** — exact parity per the shared criteria above,
  run fully offline post-OFFLINE-2.
- **SLNC cleaning offline** — exact parity per the shared criteria above,
  run fully offline post-OFFLINE-2.
- **ESG cleaning offline** — exact parity per the shared criteria above,
  run fully offline post-OFFLINE-2.
- **TSV copy offline** — Copy This Profile / Copy All Groups work
  identically offline.
- **Cached List DT use** — `localStorage` List DT cache still takes
  priority over the bundled snapshot; service worker caching of the
  application shell does not interfere with or duplicate this mechanism.
- **Bundled List DT fallback** — bundled snapshot still used correctly
  when no cache exists, served from the service worker's precache like
  the rest of the application shell.
- **Service-worker update lifecycle** — a new deployed version's service
  worker installs alongside the old one without immediately taking over a
  page that's mid-session (no operational work interrupted — see
  `docs/OFFLINE_RISK_REGISTER.md` risk on update-during-active-work).
- **Stale-cache prevention** — after an update, the next load (or an
  explicit user action, per whatever activation strategy OFFLINE-2
  chooses) serves the new version's assets, not a mix of old and new.
- **Old-cache cleanup** — previous versioned caches are deleted once the
  new version has activated; Cache Storage does not grow unbounded across
  repeated deploys.
- **New-version activation** — after activation, `config/app-config.json`,
  application JS, and CSS are all from the same deployed version — never
  a mismatched combination (see "mixed application versions" risk).

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

- The pre-OFFLINE-1 baseline run (at commit `5c6482b`) must be captured
  and retained before OFFLINE-1 begins, so the OFFLINE REGRESSION GATE
  has a fixed reference point rather than relying on memory or
  re-deriving expected values.
- The approved OFFLINE-1 gate result (the same reference files' output,
  captured at the commit where the OFFLINE REGRESSION GATE passed) must
  be captured and retained once that gate passes, so the PWA OFFLINE
  REGRESSION GATE has its own fixed reference point. This becomes the
  OFFLINE-2 baseline described in "Exact-parity requirement" above,
  superseding a direct comparison to `5c6482b` for OFFLINE-2.
