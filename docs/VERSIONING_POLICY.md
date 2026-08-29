# Versioning Policy

**Document status:** FROZEN at V2-0 (Documentation & Versioning Freeze).
**Baseline commit:** `5c6482b`.

This document establishes the policy for how this repository names,
tracks, and displays version identifiers. It does **not** assign a new
release version. Where the repository's current evidence was ambiguous,
the ambiguity was recorded explicitly (§2) and has since been resolved by
an explicit Supervisor decision (§2.4) rather than by guessing.

## 0. Current status (Supervisor-resolved, V2-0 correction pass)

| Item | Value |
|---|---|
| Latest actual Git-tagged release | `v1.0.3` |
| Current application version at HEAD (`config/app-config.json`) | `1.3.0` |
| Git tag corresponding to `1.3.0` | **none** — not tagged |
| Authoritative source for the application version | `config/app-config.json` |
| Workstream label in progress | "V2 — Offline & PWA Readiness" (label only, not a release version) |
| V2-1 planned UI-displayed string (not yet implemented) | `v1.3.0 · V2 Offline Track` |

**No git tag was created and `config/app-config.json` was not changed as
part of resolving this status** — `1.3.0` is accepted as the current,
correctly-untagged development version at this baseline. See §2.4 for the
full resolution record.

## 1. Four distinct identifiers — do not conflate

| # | Identifier | Example | Meaning |
|---|---|---|---|
| A | **Workstream label** | "V2 — Offline & PWA Readiness" | Names a roadmap/body of work (see `docs/OFFLINE_V2_ROADMAP.md`). Never a release number. |
| B | **Application version** | `1.3.0`, `1.4.0-rc.1` | Semantic Versioning (SemVer 2.0.0): `MAJOR.MINOR.PATCH[-PRERELEASE]`. |
| C | **UI-displayed version** | text rendered in the app | PLANNED (V2-1) to be read from a single source of truth at runtime — not yet implemented. |
| D | **Git tag / release identifier** | `v1.0.3` | The repository's record of what was actually tagged as released. |

**Rule: "V2" (workstream label, A) must never be read as, or converted
into, application version `2.0.0` (identifier B), or a `v2.0.0` git tag
(identifier D).** They are independent axes. A workstream can span many patch/minor releases, and a
release can ship with no active workstream label at all.

## 2. Audit findings (CURRENT repository state, as of baseline `5c6482b`)

This section is a factual record of what the audit found. It is
deliberately not reconciled into a single clean narrative, because the
sources materially disagree.

### 2.1 Identifiers found

- **`config/app-config.json`** — live, loaded at runtime by
  `js/core/app-settings.js` (`loadAppConfig()`) — `"version": "1.3.0"`.
  Nothing in the current codebase reads this field for UI display; it is
  fetched into an in-memory cache and otherwise unused today (confirmed
  by searching the JS tree — no other `version`/`appConfig.version`
  reference exists outside `app-settings.js` itself).
- **`README.md`** — states: *"Status: v0.2 Operational Pilot — PASS. v1.0
  preparation is now in its final release checklist stage — v1.0 has
  **not** been tagged yet."*
- **`docs/RELEASE_CHECKLIST.md`** — titled "Release Checklist — v1.0.0",
  states "v1.0 preparation in progress", "Latest pilot tag:
  `v0.2.0-pilot-pass`", and has every checklist item (including the final
  "READY FOR v1.0.0 TAG" decision) unchecked.
- **`docs/DECISIONS.md`** — attaches informal version labels to specific
  decisions: D010 "(v1.1.0)", D011 "(v1.2.0)", D012 "(v1.3.0, current
  `app-config.json` value)".
- **`docs/CLEANING_LOGIC_SPEC.md`** — mirrors the same informal labels
  (`v1.0.1-predeploy`, `v1.1.0`, `v1.2.0`, `v1.3.0`) against specific
  spec sections.
- **`docs/VALIDATION_CHECKLIST.md`** — same informal labels (`v1.1.0`,
  `v1.2.0`, `v1.3.0`) against specific check groups.
- **`docs/INFRASTRUCTURE_BLUEPRINT.md`** §18.1 — an illustrative example
  `app-config.json` snippet showing `"version": "0.1.0"`. This is
  documentation-example text, not a live config value, and does not match
  the real `config/app-config.json` (`1.3.0`). Stale example.
- **`docs/OPERATOR_GUIDE.md`** — describes the app as being in "controlled
  v1.0 use" and assumes the v0.2 Operational Pilot has passed.
- **`docs/PILOT_VALIDATION_LOG.md`** — records "App version / commit
  tested: `e1df503`" and "v0.2 Operational Pilot Result: PASS", "proceed
  toward v1.0 release."
- **`docs/PILOT_EXIT_CRITERIA.md`** — references "Pilot may proceed toward
  v1.0" as part of the PASS WITH ISSUES criteria.
- **`index.html`** — no version is displayed anywhere in the current UI;
  only `<title>Weighbridge Data Cleaner</title>`.

### 2.2 Git tag evidence

Actual annotated/lightweight tags present in this repository, all
confirmed ancestors of the current baseline `5c6482b`:

| Tag | Commit | Date |
|---|---|---|
| `v0.2.0-pilot-pass` | `eb0a21d` | 2026-07-08 |
| `v1.0.0` | `0bf91c2` | 2026-07-09 |
| `v1.0.1` | `d58aefa` | 2026-07-09 |
| `v1.0.2` | `c6eb59d` | 2026-07-09 |
| `v1.0.3` | `8e111bc` | 2026-07-09 |

The baseline commit `5c6482b` is dated 2026-08-29 and sits **27 commits
after** the `v1.0.3` tag, with no tag created since. No `v1.1.0`,
`v1.2.0`, or `v1.3.0` git tag exists, despite those labels appearing in
`docs/DECISIONS.md`, `docs/CLEANING_LOGIC_SPEC.md`, and
`docs/VALIDATION_CHECKLIST.md`, and despite `config/app-config.json`
already reading `"1.3.0"`.

### 2.3 Inconsistencies identified (as found, before Supervisor resolution)

1. README and RELEASE_CHECKLIST.md said v1.0 "has not been tagged yet" /
   "in progress," but git tags `v1.0.0` through `v1.0.3` already existed
   and were ancestors of the current baseline.
2. `config/app-config.json` already reads `"1.3.0"`, two minor versions
   past the last git tag (`v1.0.3`), with no corresponding `v1.1.0`,
   `v1.2.0`, or `v1.3.0` tag. The `docs/DECISIONS.md` /
   `docs/CLEANING_LOGIC_SPEC.md` / `docs/VALIDATION_CHECKLIST.md` version
   labels appear to track this config value informally (bumped in the
   same commits that changed behavior described by D010/D011/D012), but
   this has not been confirmed against commit-by-commit history, and no
   tag was created to formalize any of those three points.
3. No document defines who/what is authorized to bump
   `config/app-config.json`'s `version` field, or whether it is meant to
   track SemVer release versions at all versus being an informal
   development counter.
4. `docs/INFRASTRUCTURE_BLUEPRINT.md`'s example config (`0.1.0`) is
   stale relative to both the real config file and the informal labels
   elsewhere; it should not be read as evidence of any real historical
   version.

### 2.4 Supervisor resolution (V2-0 correction pass)

Items 1 and 2 above are **resolved** by explicit Supervisor decision,
recorded here as the authoritative interpretation:

- The latest actual Git-tagged release is `v1.0.3`. README and
  `docs/RELEASE_CHECKLIST.md` were factually wrong to state v1.0 "has not
  been tagged yet" — `v1.0.0` through `v1.0.3` are real, existing tags
  and are acknowledged as such throughout this repository's documentation
  from this point on.
- `1.3.0` (from `config/app-config.json`) is the current
  application/development version at HEAD. It is **correctly untagged**
  — this is not an error to fix. No corresponding `v1.3.0` Git tag exists,
  and none is created by this resolution.
- `config/app-config.json` is confirmed as the authoritative source for
  the current application version (identifier B).
- **This resolution explicitly does not:** change
  `config/app-config.json`'s version value, create any Git tag, create
  retroactive `v1.1.0`/`v1.2.0`/`v1.3.0` tags, or invent a new release
  number. It only corrects documentation that stated a false current
  status.

Items 3 and 4 remain **open** and are not resolved by this pass — see
§4.

## 3. Policy going forward (PLANNED, not yet implemented)

### 3.1 Single source of truth

`config/app-config.json`'s `"version"` field is designated the single
authoritative source of truth for the application version. This is now
confirmed by explicit Supervisor decision (§2.4), not merely proposed.
Reasons:

- It is already loaded at runtime (`js/core/app-settings.js`).
- It requires no build step to update (consistent with the project's
  no-build-step architecture, `docs/INFRASTRUCTURE_BLUEPRINT.md`).
- A single JSON field avoids hardcoding the same version independently in
  multiple UI/docs/code locations (the preferred architectural direction
  for this workstream).

The version-status ambiguity that previously blocked V2-1 (§2.3 items 1–2)
is resolved as of this correction pass. **No code change is made in this
pass** — `index.html` and every JS/CSS file remain untouched. V2-1
(actually reading and displaying this field in the UI) remains a separate,
not-yet-started phase; this document only confirms the policy and value
it will use once implemented.

### 3.2 How the UI will eventually consume it (PLANNED — V2-1, not V2-0)

When V2-1 is implemented, the UI-displayed version (identifier C) must be
read from `config/app-config.json` at load time through the existing
`loadAppConfig()` path — never hardcoded a second time in `index.html`,
a JS constant, or a CSS-generated string. If `app-config.json` is
unavailable (e.g. offline before OFFLINE-1/OFFLINE-2 land), the version
display must degrade gracefully (e.g. omitted or a neutral placeholder),
consistent with `loadAppConfig()`'s existing fallback to `{}` on fetch
failure — it must never block cleaning or show a stale hardcoded value in
its place.

**Planned display string (V2-1, not yet implemented):** `v1.3.0 · V2
Offline Track` — the current `config/app-config.json` version prefixed
with `v`, followed by the active workstream label as a secondary,
visually distinct suffix, so the release version and the workstream label
are never presented as a single conflated identifier. This string is
documented here for future consistency only; no UI element renders it as
of this correction pass.

### 3.3 How README/release documentation should refer to it (PLANNED)

- README's status line must name both the latest tagged release (D,
  `v1.0.3`) and the current untagged application version (B, `1.3.0`) —
  never a workstream label (A) in place of either.
- `docs/RELEASE_CHECKLIST.md` is historical: it predates the `v1.0.0`–
  `v1.0.3` tags it describes as "in progress." This correction pass adds
  a status note to the top of that document pointing to this policy
  rather than rewriting its checklist body (see §2.4 and this
  correction's file list).
- Workstream documents (like `docs/OFFLINE_V2_ROADMAP.md`) must always
  describe themselves as a workstream, and must not state or imply a
  target release version unless one has been explicitly approved
  elsewhere.

### 3.4 SemVer increment rules (PLANNED policy, for future releases)

Standard Semantic Versioning 2.0.0 applies:

- **MAJOR** increments on a breaking change to output schema/columns, a
  breaking change to supported input file formats/profiles, or removal of
  a previously-supported profile (HYNC/SLNC/ESG) or protected behavior
  listed in `docs/OFFLINE_V2_ROADMAP.md` §6.
- **MINOR** increments on backward-compatible new functionality — e.g. a
  new validation category (as D010/D011/D012 were, informally), a new UI
  capability, OFFLINE-1, or OFFLINE-2 landing.
- **PATCH** increments on backward-compatible bug fixes with no schema,
  behavior-surface, or new-capability change.
- **Prerelease identifiers** (e.g. `-rc.1`, `-pilot`, `-predeploy`) are
  appended per SemVer §9 for versions under active validation before a
  final tag — consistent with existing informal usage such as
  `v1.0.1-predeploy` seen in `docs/CLEANING_LOGIC_SPEC.md`.

### 3.5 Relationship between git tag and displayed version (PLANNED policy)

- A git tag (D) is only created for a version that has actually completed
  its release checklist/gate.
- The UI-displayed version (C) must always match `config/app-config.json`
  (B) at the commit it was built from; a git tag (D) is only meaningful
  if it points at the exact commit where `app-config.json`'s `version`
  field was bumped to match. A tag pointing at a commit whose
  `app-config.json` shows a different version is a **mixed-version**
  condition (see `docs/OFFLINE_RISK_REGISTER.md`, risk: mixed application
  versions) and must not happen.

### 3.6 Rule preventing workstream/release confusion

- Any document, commit message, or UI string that names a workstream
  (e.g. "V2 — Offline & PWA Readiness") must not, in the same breath,
  state or imply a release version number unless that number has been
  independently confirmed against `config/app-config.json` and, where
  applicable, a git tag.
- "V2 OFFLINE & PWA COMPLETE" (the workstream's own completion milestone,
  `docs/OFFLINE_V2_ROADMAP.md` §12) is not, by itself, grounds to tag or
  claim release version `v2.0.0`. Any release version at that point
  follows §3.4 above from whatever the release version was immediately
  before the workstream completed.

## 4. Explicitly not decided by this document

- Whether `config/app-config.json`'s current `"1.3.0"` should ever be
  formally tagged as `v1.3.0`, and if so, when and by whom (§2.3 item 3 —
  still open; the Supervisor's §2.4 decision confirms `1.3.0` as the
  current value and its source of truth, but does not authorize creating
  a tag for it).
- Any new release version number for future work, including anything in
  the V2 workstream.
- Actual implementation of the V2-1 UI version display (the string in
  §3.2 is planned/documented only).

Resolved by the Supervisor in this correction pass (see §2.4): the latest
tagged release is `v1.0.3`; the current application version at HEAD is
`1.3.0` and is correctly untagged; `V2` remains a workstream label only.
