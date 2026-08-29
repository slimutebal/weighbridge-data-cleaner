# V2 Workstream Roadmap — Offline & PWA Readiness

**Document status:** FROZEN at V2-0 (Documentation & Versioning Freeze).
**Baseline commit:** `5c6482b` (`fix(esg,ui): support fullwidth ore delimiters and reset navigation`).

## Naming clarification (read first)

**"V2" is a workstream label, not an application version.** It names
this multi-phase roadmap only. It does not imply, promise, or reserve the
application version `2.0.0` or a `v2.0.0` git tag, and no application
version or tag is assigned, changed, or implied by this document. See
`docs/VERSIONING_POLICY.md` for the authoritative distinction between the
workstream label and the application version.

Planning a later phase in this roadmap does **not** authorize
implementation of that phase. Each phase requires its own explicit
go-ahead after its predecessor's exit gate passes.

## 1. Purpose

Define, in one authoritative document, the full sequence of phases
required to make the Weighbridge Data Cleaner reliably usable with a real
bundled contractor list offline, and — later — installable/cacheable as a
Progressive Web App (PWA), without changing the app's existing
architecture or any cleaning/validation behavior.

## 2. Scope

This workstream covers:

- Replacing the empty bundled List DT snapshot with real contractor
  master data (OFFLINE-1).
- Adding a web app manifest and service worker for application-shell
  caching and installability (OFFLINE-2).
- Establishing a single authoritative application version identifier and,
  later, displaying it in the UI (V2-1).
- Defining and running exact-parity regression validation after each
  offline-affecting change.

## 3. Non-goals

- No backend, database, ODBC, login, or real-time weighbridge
  integration is introduced at any point in this workstream.
- No change to HYNC/SLNC/ESG cleaning, validation, grouping, or output
  logic is authorized by this roadmap.
- No Windows portable packaging is implemented in this workstream (see
  §13).
- No new application version is assigned by this roadmap itself (see
  `docs/VERSIONING_POLICY.md`).
- No claim that offline or PWA support exists is made until the
  corresponding phase has actually passed its exit gate.

## 4. Baseline commit

`5c6482b` — `fix(esg,ui): support fullwidth ore delimiters and reset
navigation`. All phase descriptions in this document assume this starting
point. If a future phase begins from a different commit, that commit must
be recorded at the start of that phase's work.

## 5. Architecture constraints (PROTECTED)

The following technology boundary is unchanged by this workstream, in
every phase, without exception:

- Static HTML, CSS, and vanilla JavaScript only.
- SheetJS vendored locally under `lib/sheetjs/` (already true today) —
  never loaded from a CDN.
- Client-side processing only; no server-side execution of any kind.
- No Python, no Streamlit, no Node backend, no database, no ODBC, no
  cloud backend, no login.
- No real-time weighbridge integration.
- Supported profiles remain exactly: HYNC, SLNC, ESG.

Any implementation proposal in a later phase that would require deviating
from this boundary is out of scope for this workstream and must be
raised as a separate decision, not folded into OFFLINE-1 or OFFLINE-2.

## 6. Protected operational behavior (PROTECTED)

None of the following may change as a *side effect* of any phase in this
roadmap. A change to any of these is a regression, not a roadmap
deliverable:

- HYNC cleaner, SLNC cleaner, ESG cleaner logic.
- Profile detection.
- Source parsing, Grade parsing.
- PILE ID handling.
- DT normalization (`normalizeDtId`, `toCanonicalDtId`).
- Contractor join behavior.
- Date handling, Shift handling (declared-bucket-is-authoritative, D009).
- Grouping (Profile + Date + Declared Bucket Shift, D004/D009).
- Net calculation.
- Weight integrity validation (D010).
- Low-net validation (D012).
- Duplicate validation (NO.NOTA).
- Reporting (Validation Report, Operational Summary, Overview).
- Readiness/copy-gating logic (`js/core/readiness.js`).
- Output schema and column order.
- TSV formatting/copy behavior.

The only behavior explicitly expected to *improve* as a result of this
workstream is contractor-mapping match rate, once OFFLINE-1 replaces the
empty bundled List DT with real master data (see §9, OFFLINE-1 permitted
difference).

## 7. Full phase roadmap

```
BASELINE (5c6482b)
   │
   ▼
V2-0 — Documentation & Versioning Freeze   [THIS PHASE]
   │
   ▼
V2-0 GATE
   │
   ▼
V2-1 — App Version Display
   │
   ▼
V2-1 GATE
   │
   ▼
OFFLINE-1 — Real Bundled List DT
   │  (offline smoke test, zero-network validation)
   ▼
OFFLINE REGRESSION GATE
   │  (HYNC / SLNC / ESG exact parity)
   ▼
OFFLINE-2 — Manifest + Service Worker
   │  (atomic versioned cache)
   ▼
PWA OFFLINE REGRESSION GATE
   │  (HYNC / SLNC / ESG exact parity)
   ▼
V2 OFFLINE & PWA COMPLETE
   │
   ▼
OPTIONAL, FUTURE-ONLY: Windows Portable Packaging
```

Each phase in this list is described in full below (§8–§10). No phase may
be started before its predecessor's gate has passed.

## 8. Phase definitions: entry/exit criteria

### V2-0 — Documentation & Versioning Freeze [CURRENT]

- **Entry criteria:** baseline commit confirmed, worktree clean.
- **Work:** documentation only — this roadmap, the versioning policy, the
  offline test plan, the offline risk register, and a minimal README
  pointer. No application code, config, or data changes.
- **Exit criteria (V2-0 GATE):**
  - The four V2-0 documents exist and are internally consistent with each
    other and with this roadmap.
  - README references this roadmap without overstating current
    capability.
  - No application code, `config/*.json`, or List DT data was modified.
  - No manifest or service worker file was created.
  - Documented version/release findings (see `docs/VERSIONING_POLICY.md`
    §2) are recorded accurately, and the blocking version-status
    inconsistency (§2.3 items 1–2) is resolved by explicit Supervisor
    decision (§2.4/§0), not silently patched over or guessed.
- **STOP CONDITION:** assigning a *new* release number (e.g. formally
  tagging `1.3.0`, or choosing a version beyond it) without unambiguous
  repository evidence remains deferred to the Supervisor/user — it is not
  made inside V2-0. This is distinct from, and does not block, the
  Supervisor's §2.4 confirmation that `v1.0.3` is the latest tag and
  `1.3.0` is the current correctly-untagged application version.

### V2-1 — App Version Display

- **Entry criteria:** V2-0 GATE passed; `docs/VERSIONING_POLICY.md`
  approved as the source-of-truth policy. The current version value
  (`1.3.0`, from `config/app-config.json`, per `VERSIONING_POLICY.md` §0)
  is already resolved as of the V2-0 correction pass, so this entry
  criterion is satisfied on that point.
- **Work (PLANNED, not yet implemented):** surface the authoritative
  application version (per `docs/VERSIONING_POLICY.md`) in the UI — e.g.
  in the header or Settings dialog — read from one source of truth
  (`config/app-config.json` via `loadAppConfig()`), never hardcoded a
  second time in markup or a separate JS constant. Planned display string:
  `v1.3.0 · V2 Offline Track` (`docs/VERSIONING_POLICY.md` §3.2).
- **Exit criteria:** the UI-displayed version matches the authoritative
  source with no drift, verified after a full rebuild/reload with no
  cleaning-logic or output changes.
- **STOP CONDITION:** if the authoritative version value has changed or
  become newly ambiguous by the time V2-1 actually starts (e.g. a tag or
  config bump happened in between), V2-1 cannot proceed on a stale
  assumption — it must re-confirm against `docs/VERSIONING_POLICY.md` §0
  first rather than use a cached value.

### OFFLINE-1 — Real Bundled List DT

- **Entry criteria:** V2-1 GATE passed.
- **Zero-network scope (phase boundary):** OFFLINE-1 targets *external*-
  network independence — the WAN/internet and the Google Apps Script
  endpoint are unavailable, but the local HTTP origin serving the
  application's static files/config remains available, and cleaning
  succeeds using cached or bundled List DT. OFFLINE-1 does **not** yet
  include a Service Worker, so it must not require the application shell
  itself to cold-boot/reload while the browser blocks all HTTP requests
  (including localhost) — that full application-shell offline
  boot/reload capability is OFFLINE-2's target, once the Service Worker
  lands (see OFFLINE-2 below). See `docs/OFFLINE_TEST_PLAN.md` Scenario C
  for the validation method.
- **Scope (PLANNED):**
  - Replace the currently empty `data/default-list-dt.json` (`[]`) with a
    valid, real contractor-mapping snapshot.
  - Preserve existing `localStorage` cache-priority behavior (cache wins
    over bundled, per `js/core/list-dt-manager.js`) unchanged.
  - Preserve manual **Update List DT** (Google Sheet fetch) behavior
    unchanged.
  - Preserve pending-sync-queue behavior (`js/core/list-dt-manager.js`,
    §"Local pending sync and Google Sheet sync" in README) unchanged.
  - Perform an offline smoke test (app usable with network available but
    List DT not re-fetched).
  - Perform a zero-external-network validation: external internet/WAN and
    the Google Apps Script endpoint verified unreachable, while the local
    HTTP application origin (loopback/localhost) remains reachable and
    continues serving static files/config — not just the Update List DT
    button left unclicked.
- **Exit criteria (OFFLINE REGRESSION GATE):** HYNC/SLNC/ESG exact parity
  per `docs/OFFLINE_TEST_PLAN.md` against baseline `5c6482b`, with the one
  permitted difference being improved contractor-match/unmatched counts
  (§9 below). Once passed, this gate's result is captured and retained as
  the OFFLINE-2 comparison baseline (§9).

### OFFLINE-2 — Manifest + Service Worker

- **Entry criteria:** OFFLINE REGRESSION GATE passed.
- **Zero-network scope (phase boundary):** OFFLINE-2 targets full
  application-shell offline boot/reload — the Service Worker provides
  HTML/JS/CSS/config/assets so the app loads and functions with no
  network fetch at all, including the local HTTP origin. This is what
  validates localhost/network fetch independence; OFFLINE-1's
  external-network-only scope (above) is superseded here, not repeated.
- **Scope (PLANNED):**
  - `manifest.json` (name, icons, start URL, display mode).
  - `service-worker.js` implementing an atomic, versioned cache strategy
    for the application shell (HTML/CSS/JS/vendored SheetJS/static JSON
    config needed to boot).
  - Service worker registration from the app's own bootstrap code.
  - Required PWA metadata/icons.
  - A controlled update lifecycle (new service worker installs, does not
    activate until the old cache is safely superseded, no silent mixed
    old/new asset state — see `docs/OFFLINE_RISK_REGISTER.md` risk on
    mixed application versions).
- **Explicit exclusions (STOP CONDITION if violated):**
  - Google Apps Script requests (List DT update/sync endpoint) **must
    not** be served from, or captured by, the application service-worker
    cache. They must always go to the network, exactly as today.
  - Uploaded source Excel files and cleaning results **must not** be
    persisted in Cache Storage (or any other new persistent store
    introduced by this phase) as part of this workstream. They remain
    in-memory/session-scoped as today.
- **Exit criteria (PWA OFFLINE REGRESSION GATE):** HYNC/SLNC/ESG exact
  parity per `docs/OFFLINE_TEST_PLAN.md` against the approved OFFLINE-1
  gate state (§9) — zero new Contractor or other output differences —
  with protected non-Contractor behavior (§6) remaining traceable to
  `5c6482b`, plus full installability and offline-reload validation.

### V2 OFFLINE & PWA COMPLETE

Reached only when both the OFFLINE REGRESSION GATE and the PWA OFFLINE
REGRESSION GATE have passed. This marks completion of the *workstream*,
not automatically a new application version or git tag — a version/tag
decision is separate and follows `docs/VERSIONING_POLICY.md`.

## 9. OFFLINE-1 permitted difference and baseline chain

The Contractor value for a row whose DT ID was "Unmatched" at baseline
`5c6482b` (bundled List DT was `[]`) **may legitimately change** to a
resolved contractor name once OFFLINE-1 ships a real bundled List DT
snapshot that resolves that same DT ID — and unmatched-DT counts /
Contractor-derived summaries may change consistently with that same
improvement. Contractor is part of the TSV output, so this difference
does show up in copied TSV text for the affected cell only; it is not an
exception to TSV structure, column order, or formatting, which remain
identical. This is the one and only difference *authorized* to appear
anywhere in this workstream, and it is authorized only by OFFLINE-1 — no
other phase introduces a new Contractor difference. No other field, no
row-count, no tonnage, no grouping, no validation outcome, and no other
TSV/formatting difference is permitted, in any phase, without being
treated as a regression.

**Baseline chain:** the OFFLINE REGRESSION GATE (after OFFLINE-1)
compares directly against `5c6482b`, with this Contractor difference as
the sole exception. Once that gate passes, its approved result —
including the resolved Contractor values — is captured and retained as
the primary comparison baseline for the PWA OFFLINE REGRESSION GATE
(after OFFLINE-2), superseding a direct `5c6482b` comparison for that
gate. This is why the approved OFFLINE-1 Contractor state legitimately
persists unchanged through OFFLINE-2: OFFLINE-2 is not introducing a
*new* Contractor difference, it is inheriting an already-approved one.
OFFLINE-2 itself introduces **zero new differences of any kind,
Contractor included** — its Contractor values must be byte-identical to
the approved OFFLINE-1 state, and all protected non-Contractor behavior
(§6) must remain traceable to `5c6482b` (true by construction, since the
OFFLINE-1 approved state already matches `5c6482b` on every
non-Contractor field). See `docs/OFFLINE_TEST_PLAN.md` ("Exact-parity
requirement") for the full rule.

## 10. Validation gates

Four gates exist in this roadmap:

1. **V2-0 GATE** — documentation consistency (this phase).
2. **V2-1 GATE** — version display correctness.
3. **OFFLINE REGRESSION GATE** — HYNC/SLNC/ESG exact parity after
   OFFLINE-1 against baseline `5c6482b`, with the one permitted Contractor
   difference (§9) (see `docs/OFFLINE_TEST_PLAN.md`).
4. **PWA OFFLINE REGRESSION GATE** — HYNC/SLNC/ESG exact parity after
   OFFLINE-2 against the approved OFFLINE-1 gate state (§9), plus PWA
   lifecycle correctness (see `docs/OFFLINE_TEST_PLAN.md`).

A gate is a hard stop: the next phase does not begin until its
predecessor's gate has a recorded PASS.

## 11. Rollback principles

- Each phase is implemented as its own commit series, so a phase can be
  reverted independently without unwinding an earlier, already-gated
  phase.
- OFFLINE-2's service worker must never be the only path to a working
  app: if the service worker or its cache is corrupted/stale, a hard
  reload against the network must still produce a correct, current
  application (no permanent offline lock-in from a bad cache).
- Rolling back OFFLINE-2 (removing/disabling the service worker) must not
  require also rolling back OFFLINE-1 (the bundled List DT snapshot is
  independent of PWA caching).
- The existing legacy Excel/Power Query/Macro workflow (referenced in
  `docs/RELEASE_CHECKLIST.md` §8) remains the operational fallback
  throughout this workstream, unchanged.

## 12. Definition of V2 completion

The V2 — Offline & PWA Readiness workstream is complete when:

- OFFLINE-1 has shipped a real bundled List DT snapshot and passed the
  OFFLINE REGRESSION GATE.
- OFFLINE-2 has shipped manifest + service worker and passed the PWA
  OFFLINE REGRESSION GATE.
- HYNC/SLNC/ESG exact parity is confirmed at both gates.
- No protected operational behavior (§6) changed as a side effect.
- Documentation (this roadmap, versioning policy, test plan, risk
  register) reflects the actually-shipped behavior, not aspirational
  behavior.

Completion of this workstream does **not** by itself define or require a
new application version or git tag — see `docs/VERSIONING_POLICY.md`.

## 13. Windows portable packaging (FUTURE-ONLY, OUT OF SCOPE)

Windows portable packaging (e.g. wrapping the static app for offline
desktop distribution outside a browser) is explicitly **out of scope**
for the current V2 workstream implementation. It appears in this roadmap
only as an optional, later, separately-scoped item that follows *after*
"V2 OFFLINE & PWA COMPLETE." No design, dependency, or implementation
decision for it is made, implied, or reserved by this document. Listing
it here does not authorize starting it.
