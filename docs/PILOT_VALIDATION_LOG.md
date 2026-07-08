# Pilot Validation Log

## 1. Pilot Purpose

This log records the results of the v0.2 Operational Pilot: running real
(or representative) operational weighbridge files through the Weighbridge
Data Cleaner app and comparing its output against the legacy Excel +
Power Query + Macro workflow, before the app is considered ready for a
v1.0 release.

The pilot exists to catch discrepancies that only show up with real
operational files and real operators — not the three fixed reference
samples already used during development (see
`docs/LEGACY_PARITY_PROFILE.md`).

## 2. Pilot Scope

- Profiles in scope: HYNC, SLNC, ESG.
- Both Day Shift and Night Shift buckets.
- Wrong-bucket rejection behavior (see `README.md` "Wrong shift bucket
  rejection").
- Contractor (List DT) matching, including Unmatched DT Correction.
- Validation Report, Operational Summary, Shift Warning Rows, and
  Unmatched DT Correction sections on each profile page.
- TSV clipboard output (Copy This Profile / Copy All Groups) pasted into
  Excel.
- Out of scope for this pilot: UI redesign, dark/light theme, XLSX
  export, PWA/offline install, desktop packaging (see "Current MVP
  limitations" in `README.md`).

## 3. Tested App Version

| Field | Value |
|---|---|
| App version / commit tested | `efe3075` — fix: keep result tabs sticky while scrolling |
| Pilot doc baseline | v0.2 Operational Pilot |
| Prior milestone | Prepilot UX and validation hardening completed |

## 4. Tester / Date

| Field | Value |
|---|---|
| Tester name | |
| Role | |
| Date(s) of testing | |
| Environment (browser + version, OS) | |
| Live Server extension used | Yes / No |

## 5. Validation Matrix

Fill in one row per uploaded file. "Legacy" columns come from the
corresponding legacy Excel/Power Query/Macro output for the same file.
Leave a cell blank (not zero) if genuinely not applicable, and use the
Notes column to explain any blank or unusual value.

| No | File Name | Profile | Declared Bucket | Detected Result | Report Date | Row Count App | Row Count Legacy | Raw Tonnage App | Raw Tonnage Legacy | Clean Tonnage App | Tonnage Difference | Missing Contractor | Missing Source | Missing Grade | Duplicate NO.NOTA | PILE ID Source Conflict | Shift Warnings | TSV Paste Number Check | Result | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | | | | | | | | | | | |
| 2 | | | | | | | | | | | | | | | | | | | | |
| 3 | | | | | | | | | | | | | | | | | | | | |

Column notes:

- **Detected Result** — Accepted / Rejected (wrong bucket) / Could not
  detect profile.
- **Tonnage Difference** — App Clean Tonnage minus Legacy tonnage; record
  the signed value, not just pass/fail.
- **Missing Contractor / Source / Grade** — counts from that group's
  Validation Report.
- **TSV Paste Number Check** — Pass / Fail, based on whether Net and Grade
  pasted into Excel as native numbers (right-aligned, no leading
  apostrophe, no `NI:` prefix).
- **Result** — Pass / Fail for this row only.

## 6. Issue Log

| No | File Name | Issue Description | Severity (Blocker / Major / Minor) | Steps to Reproduce | Screenshot/Evidence | Status (Open / Fixed / Won't Fix) |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |

## 7. Pass / Fail Criteria

See `docs/PILOT_EXIT_CRITERIA.md` for the full definitions. Summary used
to score each matrix row's **Result** column:

- **Pass** — row counts and tonnage reconcile with legacy within the
  0.01 rounding tolerance, report date grouping is correct, wrong-bucket
  rejection behaved correctly, and TSV pasted as numbers.
- **Fail** — any numeric mismatch, wrong report-date grouping, incorrect
  Source/Grade/PILE ID derivation, wrong contractor join caused by app
  logic, or wrong-bucket validation failure.

## 8. Decision

Select one, based on the aggregated matrix and issue log results.

- [ ] **PASS** — proceed toward v1.0 release.
- [ ] **PASS WITH ISSUES** — proceed, with known minor issues tracked for
      a later fix.
- [ ] **REVISE** — return to development to fix the specific issues
      logged above before re-running the pilot.
- [ ] **REJECT** — app is not reliable enough for operational use in its
      current state.

**Decision rationale:**

**Decided by:**

**Date:**
