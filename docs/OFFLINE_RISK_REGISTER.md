# Offline & PWA Risk Register

**Document status:** OFFLINE-1 IMPLEMENTED — AUTOMATED REGRESSION PASS,
MANUAL OFFLINE VALIDATION PENDING (genuine external-network browser
testing to be performed separately by the Supervisor/user). R-01/R-02/
R-03/R-18 mitigations described below are now implemented; all other
rows remain planned for OFFLINE-2.
**Baseline commit:** `5c6482b`.

This register tracks risks specific to the V2 — Offline & PWA Readiness
workstream (`docs/OFFLINE_V2_ROADMAP.md`). OFFLINE-2 risks (R-05 through
R-13, and the OFFLINE-2-only aspects of R-08/R-09) remain planning-only;
none of their mitigations are implemented yet.

| Risk ID | Risk | Cause | Impact | Likelihood | Severity | Mitigation | Validation / detection | Phase |
|---|---|---|---|---|---|---|---|---|
| R-01 | Empty bundled List DT | `data/default-list-dt.json` shipped as `[]` before OFFLINE-1 | Every contractor showed "Unmatched" when no cache existed (pre-OFFLINE-1 MVP limitation) | N/A (resolved) | Medium | **Implemented:** `data/default-list-dt.json` now ships a real 724-record snapshot (see "OFFLINE-1 bundled List DT snapshot record" below) | `tests/offline1-list-dt.test.mjs` (bundled snapshot integrity, bundled fallback); Scenario B/F in `docs/OFFLINE_TEST_PLAN.md` (not run — no browser tooling available in this Builder environment) | OFFLINE-1 |
| R-02 | Stale List DT cache | `localStorage` cache from an old **Update List DT** run is never expired/versioned | Contractor mapping silently drifts from the Google Sheet source of truth over time | Medium | Medium | Still out of scope for OFFLINE-1/-2 to fully solve; documented as a known, accepted limitation; a cache-age indicator remains a candidate for a later, separately-scoped phase | Manual comparison of cached vs. current Sheet during pilot use | OFFLINE-1 (documented, not fixed) |
| R-03 | Browser localStorage cleared | User clears site data, uses private browsing, or storage is disabled | Loses List DT cache and pending-sync queue; falls back to bundled snapshot | Low–Medium | Low (post-OFFLINE-1, since bundled snapshot is real data) | **Implemented:** OFFLINE-1's real bundled snapshot is the mitigation; graceful fallback (no crash, no fatal error) verified by `tests/offline1-list-dt.test.mjs` scenario C | Scenario E in `docs/OFFLINE_TEST_PLAN.md` (not run — no browser tooling available in this Builder environment) | OFFLINE-1 |
| R-04 | Different localhost origins using different storage | Live Server / different ports / `file://` vs `http://` each have separate `localStorage` and Cache Storage per browser origin rules | Cache/pending-sync state silently "disappears" when the app is opened from a different origin/port than before | Medium (dev/test environments especially) | Medium | Document the origin-stability requirement for testers; standardize on one fixed local origin/port during OFFLINE testing | Explicitly recorded in test evidence (origin URL used) per `docs/OFFLINE_TEST_PLAN.md` | OFFLINE-1, OFFLINE-2 |
| R-05 | Service worker stale JavaScript | A new deploy's service worker cache serves old `.js` files after update | Operators run outdated cleaning logic without knowing it | Medium | High | Atomic, versioned cache naming; controlled activation lifecycle (no auto-takeover mid-session); cache-busting on the precache manifest | Stale-cache-prevention and new-version-activation scenarios in `docs/OFFLINE_TEST_PLAN.md` | OFFLINE-2 |
| R-06 | Service worker stale config | `config/app-config.json` or `config/shift-rules.json` served from an old cached version | Wrong `listDtEndpoint`, weight-integrity tolerances, or shift rules applied silently | Medium | High | Config files included in the same atomic versioned precache as JS/CSS — never cached independently with a different lifetime | Old-cache-cleanup and new-version-activation scenarios | OFFLINE-2 |
| R-07 | Mixed application versions | Partial cache update, failed activation, or a bug in the update lifecycle leaves `main.js`, `cleaner.js`, and `app-config.json` from different deployed versions active simultaneously | **Critical** — cleaning logic and config can silently diverge (e.g. new validation rule running against old tolerance config), producing incorrect results with no visible error | Low–Medium | **Critical** | Single atomic cache-version identifier covering the entire application shell as one unit; no per-file cache versioning; activation only swaps the whole versioned cache at once, never file-by-file | Explicit check as part of the PWA OFFLINE REGRESSION GATE: confirm all shipped files report the same version/build identifier after an update | OFFLINE-2 |
| R-08 | `app-config.json` unavailable offline | Fetch fails before OFFLINE-2's service worker precache exists, or precache omits it | `loadAppConfig()` already falls back to `{}` (per `js/core/app-settings.js`) — but a `{}` fallback silently disables `listDtEndpoint`, weight-integrity, and low-net-weight config, changing validation behavior without any visible warning | Low post-OFFLINE-2 (precached); Medium pre-OFFLINE-2 if used offline before OFFLINE-1/2 land | High | OFFLINE-2 must include `config/app-config.json` in the precached application shell; OFFLINE-1/pre-OFFLINE-2 testing must explicitly check this failure mode rather than assume it can't happen | Scenario checks in `docs/OFFLINE_TEST_PLAN.md`; explicit assertion that weight-integrity/low-net thresholds are non-empty after an offline load | OFFLINE-1 (documented risk), OFFLINE-2 (mitigated) |
| R-09 | `shift-rules.json` (`config/shift-rules.json`) unavailable offline | `js/core/shift-classifier.js`'s `loadShiftRules()` does a bare `fetch("./config/shift-rules.json")` with no `try/catch` and no fallback value; `js/core/cleaning-orchestrator.js`'s `runCleaning()` awaits it via `Promise.all([loadShiftRules(), ...])` alongside List DT and app config loading | **Not informational-only** — a genuine fetch failure (offline with no cache of this file, or the file missing/blocked) throws inside `loadShiftRules()`, which rejects the `Promise.all()`, which rejects `runCleaning()` itself. Cleaning does not silently degrade to reduced shift-audit information; it can fail to run at all, blocking every profile for that run | Low post-OFFLINE-2 (precached); Medium pre-OFFLINE-2 if the app is used offline before OFFLINE-1/2 land | **High** | OFFLINE-2 must precache `config/shift-rules.json` in the same atomic, versioned application-shell cache as the JS/config assets described for R-06, so the fetch always succeeds offline post-OFFLINE-2 | Explicit offline boot/cleaning test proving shift rules are available and cleaning completes successfully from the correct application version, fully offline (see `docs/OFFLINE_TEST_PLAN.md`) | OFFLINE-2 |
| R-10 | Accidental caching of the Google Apps Script endpoint | A broad service-worker fetch-handler (e.g. catch-all `fetch` interception) unintentionally caches or intercepts `listDtEndpoint` requests | Update List DT / Sync Pending DT could return a stale cached response instead of hitting the network, silently faking success/failure or serving stale contractor data | Medium (easy mistake in a naive service-worker implementation) | High | Service worker's fetch handler must explicitly exclude the Google Apps Script origin/path from any cache strategy — network-only, pass-through, for that request | Explicit test: confirm a Sync Pending DT request appears in the Network tab as a real network request even with the service worker active, and that DevTools Application → Cache Storage never contains an entry for the endpoint URL | OFFLINE-2 |
| R-11 | Service-worker update during active operational work | A new version activates mid-session while an operator has files uploaded/results on screen | Operator's in-progress session could be disrupted, or a partially-updated app state could produce inconsistent behavior | Medium | High | Controlled update lifecycle: new service worker does not force-activate over an open, active page; update takes effect on next full load/reopen, not mid-session | Update-during-active-work is an explicit OFFLINE-2 scenario in `docs/OFFLINE_TEST_PLAN.md` | OFFLINE-2 |
| R-12 | Cache invalidation failure | Old versioned cache is not deleted correctly on activation (e.g. an exception during cleanup) | Cache Storage grows unbounded; possible resource exhaustion; possible fallback to an old cache on a future failure | Low–Medium | Medium | Explicit, tested cache-cleanup step in the activate handler; log/report failures rather than silently continuing | Old-cache-cleanup scenario in `docs/OFFLINE_TEST_PLAN.md`; manual Cache Storage inspection after repeated deploys | OFFLINE-2 |
| R-13 | Source Excel data accidentally persisted | A naive implementation caches all same-origin responses/requests indiscriminately, or an in-app blob URL/object gets swept into Cache Storage | Uploaded source Excel data or cleaning results (potentially sensitive operational data) persist on disk beyond the current session, contrary to the app's current in-memory-only handling | Low if scoped correctly; **must be actively prevented, not assumed away** | High | Service worker cache strategy is explicitly scoped to a fixed, known list of application-shell assets (precache manifest) — never a generic "cache everything same-origin" strategy; uploaded files/results are never written through any Cache API call | Explicit OFFLINE-2 gate check: inspect Cache Storage contents after a full upload+clean+copy cycle and confirm only application-shell assets are present | OFFLINE-2 |
| R-14 | Regression in HYNC | Any OFFLINE-1/OFFLINE-2 change unintentionally touches shared code paths (List DT join, config loading) used by the HYNC cleaner | Silent HYNC output change | Low (if scope is respected) | Critical if it occurs | Strict architecture boundary (`docs/OFFLINE_V2_ROADMAP.md` §5–6); exact-parity regression testing before every gate | **OFFLINE-1: NONE found.** `tests/offline1-baseline-parity.test.mjs` (`node tests/offline1-baseline-parity.test.mjs`) — HYNC group `samples/hync/16-05-2026 PAGI B.xlsx`: 337 rows, 14,421.19 t tonnage, all non-Contractor fields, TSV structure/order, and every validation count other than unmatchedDtCount byte-identical to the retained `5c6482b` baseline (`tests/fixtures/offline1-baseline-5c6482b.json`); zero production JS changed | OFFLINE-1, OFFLINE-2 |
| R-15 | Regression in SLNC | Same class of risk as R-14, for SLNC | Silent SLNC output change | Low (if scope is respected) | Critical if it occurs | Same as R-14 | **OFFLINE-1: NONE found.** Same test/run — SLNC group `samples/slnc/16-05-2026 PAGI B SLNC.xlsx`: 109 rows, 4,776.33 t tonnage, exact parity except Contractor resolutions | OFFLINE-1, OFFLINE-2 |
| R-16 | Regression in ESG | Same class of risk as R-14, for ESG | Silent ESG output change | Low (if scope is respected) | Critical if it occurs | Same as R-14 | **OFFLINE-1: NONE found.** Same test/run — ESG group `samples/esg/(Data Timbangan Ore 16 Mei  2026) DAY SHIFT.xlsx`: 224 rows, 10,547.46 t tonnage, exact parity except Contractor resolutions | OFFLINE-1, OFFLINE-2 |
| R-17 | False offline success caused only by browser HTTP cache | Tester assumes "app worked with network idle" proves offline capability, without verifying network was actually disabled | Either the OFFLINE REGRESSION GATE (OFFLINE-1) or the PWA OFFLINE REGRESSION GATE (OFFLINE-2) could pass on a false positive, later failing for real users on a genuinely disconnected/cold-offline load | Medium (easy testing mistake) | High (undermines the entire gate's validity) | Every offline test scenario requires a *verified* disabled-network condition appropriate to its phase — for OFFLINE-1, external network/WAN and the Google endpoint verified unreachable while the local HTTP origin is confirmed still reachable; for OFFLINE-2, full request-layer isolation (DevTools Offline throttling or OS-level disconnect, confirmed in the Network tab) — never just "didn't touch the network" | Explicitly called out in `docs/OFFLINE_TEST_PLAN.md`; evidence must include a screenshot/log of the verified offline state | OFFLINE-1, OFFLINE-2 |
| R-18 | Bundled List DT snapshot becoming operationally stale | OFFLINE-1's real snapshot is a point-in-time export; contractor list changes over time via Google Sheet, and the bundled file is not automatically regenerated | Over time, the "offline fallback" quality degrades back toward R-01's symptoms even though the file is no longer literally empty | Medium (ongoing, not a one-time event) | Medium | **Implemented (OFFLINE-1):** documented point-in-time snapshot with a defined manual refresh process — see "OFFLINE-1 bundled List DT snapshot record" below | Periodic manual comparison against the live Google Sheet; tracked as an operational task, not an automated check | OFFLINE-1 |

## Critical/high-severity risks requiring explicit gate sign-off

The following are classified **Critical** or **High** and must have an
explicit, recorded PASS before their respective gate closes — a passing
regression test suite alone is not sufficient sign-off for these:

- **R-07 — Mixed application versions (Critical).** Forbidden state
  example: `main.js` = new version, `cleaner.js` = old version,
  `app-config.json` = old version, all served simultaneously. The
  OFFLINE-2 service-worker design must make this state structurally
  impossible (single atomic versioned cache unit), not merely unlikely.
- **R-09 — `shift-rules.json` unavailable offline (High).** Not merely
  informational: an unhandled `loadShiftRules()` fetch failure rejects
  `runCleaning()` via `Promise.all()`, so cleaning itself can fail to run
  offline until OFFLINE-2 precaches `config/shift-rules.json`. Requires an
  explicit offline boot/cleaning test proving successful completion, not
  just an absence of console errors.
- **R-14 / R-15 / R-16 — HYNC/SLNC/ESG regressions (Critical).** Any
  confirmed regression in any of the three profiles blocks the
  corresponding gate outright, regardless of how minor it appears.

## OFFLINE-1 bundled List DT snapshot record (R-18)

`data/default-list-dt.json` was regenerated from a one-time development
acquisition against the authoritative endpoint (`config/app-config.json`
→ `listDtEndpoint`). This record is the R-18 refresh/provenance
documentation required at OFFLINE-1 implementation time.

- **Source:** the configured Google Apps Script List DT endpoint (the
  same endpoint **Update List DT** uses; no second endpoint was
  hardcoded anywhere in application code).
- **Acquisition timestamp:** `2026-08-29T05:37:40Z` (UTC, ISO-8601).
- **Raw records fetched:** 738.
- **Invalid/skipped records:** 0.
- **Normalized unique DT count (records written):** 724.
- **Normalized harmless duplicates (same DT + same contractor,
  deduplicated):** 14.
- **Normalized contractor conflicts found:** 0 (none — if any had been
  found, the snapshot generation would have stopped rather than silently
  picking a contractor; see the canonicalization method below).
- **Canonicalization method:** each raw record's `dt_id` was matched via
  the existing `normalizeDtId()` (punctuation-free join key) and
  displayed via the existing `toCanonicalDtId()` (canonical master
  format, e.g. `SCM-HLG 958`) from `js/core/normalizers.js` — no new
  normalizer logic was introduced. Records are sorted by `dt_id`
  ascending for deterministic diffs, contain only `dt_id`/`contractor`
  fields, and carry no endpoint URL, timestamp, or provenance metadata
  inside the runtime file itself (this document is the provenance
  record, not the runtime file).
- **Checksum (SHA-256) of `data/default-list-dt.json` after
  generation:**
  `81da72f1c4eb43589204decf4322d391fc1641fef2b6cc3f5aac3360a7e582e9`

**Refresh rule:** the bundled file is a point-in-time fallback, not a
live sync. It must be manually refreshed periodically (recommended:
whenever the Google Sheet contractor list is known to have changed
materially, or at a routine operational review cadence chosen by the
Supervisor/operator — no automated schedule is implemented). To refresh:
fetch the current data from the configured `listDtEndpoint`, canonicalize
and validate it the same way (reject blank `dt_id`/`contractor`, dedupe
identical-contractor duplicates, **stop and escalate** rather than
silently resolve any normalized-DT conflict with different contractors
across records), sort by `dt_id` ascending, and replace
`data/default-list-dt.json` with only `dt_id`/`contractor` fields. This
does not require an application code change.
**Update List DT** (the existing manual, user-triggered Google Sheet
fetch, `js/core/list-dt-manager.js`) remains the mechanism for obtaining
newer contractor data during normal online operation — it is unaffected
by this bundled-snapshot refresh process. The existing `localStorage`
cache from a successful **Update List DT** still has priority over the
bundled snapshot in all cases (see `js/core/list-dt-manager.js`
`loadListDt()`), unchanged by OFFLINE-1.

**Public repository decision (Supervisor/user, recorded here once):**
this repository is public, and `data/default-list-dt.json` is
intentionally permitted to be committed to it in full. The file contains
only `dt_id` and `contractor` fields — a point-in-time, incomplete
operational fallback mapping — and is not classified as confidential
source data for this project. No encryption, obfuscation, redaction, or
private-deployment-artifact architecture is required or was introduced
because of the repository's public visibility; this decision applies to
this file specifically and does not itself reclassify any other data in
the repository.

## Out-of-scope risks (not tracked by this register)

Risks specific to Windows portable packaging are out of scope for this
register, since that work is future-only and unscoped per
`docs/OFFLINE_V2_ROADMAP.md` §13.
