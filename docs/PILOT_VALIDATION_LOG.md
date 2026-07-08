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
| App version / commit tested | `e1df503` — docs: add operational pilot validation plan |
| App code baseline | `efe3075` — fix: keep result tabs sticky while scrolling |
| Latest app fix commit (pilot closure) | `141221f` — fix: use declared shift in clean output |
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
| 1 | 07月07日SCM-ESG送矿汇总表 (Data Timbangan Ore 07 Juli 2026) NIGHT SHIFT.xlsx | ESG | Day Shift Input | Rejected (wrong bucket) | | | | | | | | | | | | | | | Pass | Wrong-bucket popup appeared. Detected Night Shift: DS rows 10, NS rows 529, Unknown timestamp rows 6. File was removed from Day Shift Input and instructed to upload to Night Shift Input. |
| 2 | | | | | | | | | | | | | | | | | | | | |
| 3 | | | | | | | | | | | | | | | | | | | | |

**Batch 1 note:** Initial manual smoke test passed for wrong-bucket
rejection and core UI flow. Operator has since confirmed the full set of
critical operational checks (see §9 Pilot Closure Summary) across
accepted HYNC/SLNC/ESG Day/Night files; the row-by-row legacy parity
matrix above may still be expanded later as further audit evidence, but
is not blocking the PASS decision in §8.

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
| 1 | Night Shift files (HYNC/SLNC/ESG) | Clean output rows showed Shift = DS for rows whose own timestamp classified as DS, even though the file was accepted into Night Shift Input. Clean output Shift must always follow the declared bucket. | Blocker | Upload an accepted Night Shift file into Night Shift Input; open Clean Data Preview / Copy This Profile TSV; observe some rows with Shift = DS instead of NS. | | Fixed (commit `141221f` — fix: use declared shift in clean output) — Clean output Shift now follows declared bucket; row-level detected shift remains in Shift Warning Rows. |
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

- [x] **PASS** — proceed toward v1.0 release.
- [ ] **PASS WITH ISSUES** — proceed, with known minor issues tracked for
      a later fix.
- [ ] **REVISE** — return to development to fix the specific issues
      logged above before re-running the pilot.
- [ ] **REJECT** — app is not reliable enough for operational use in its
      current state.

**Decision rationale:** Operator-confirmed pilot validation passed for
supported profiles, Day/Night bucket validation, report-date grouping,
declared-shift output, List DT correction, TSV copy/paste, and navigation
UI. No blocking data-loss, row-count, tonnage, report-date, or
shift-output issue remains open.

**Decided by:** Operator (manual pilot confirmation)

**Date:** 2026-07-08

## 9. Pilot Closure Summary

**v0.2 Operational Pilot Result:** PASS

This PASS is based on operator-confirmed manual validation. The detailed
per-file legacy parity matrix may be expanded later as audit evidence,
but no blocking operational issue remains from the tested pilot flow.

Latest app fix commit: `141221f` — fix: use declared shift in clean
output.

Operator-confirmed behaviors:

- Wrong-bucket rejection works — files uploaded into the wrong Day/Night
  bucket are rejected and removed.
- Accepted ESG Night Shift file passes.
- Accepted HYNC Night Shift file passes.
- Accepted SLNC Night Shift file passes.
- Day/Night declared bucket behavior is correct.
- Clean output Shift follows declared bucket: Day Shift Input → DS,
  Night Shift Input → NS.
- Row-level detected shift remains audit-only in Shift Warning Rows.
- Report-date grouping works: HYNC/SLNC use 日期, ESG uses TANGGAL.
- Night Shift files crossing midnight do not split operational groups.
- First-worksheet-only behavior works.
- Operational Summary sorting works.
- Canonical List DT format works: `SCM-LIM xxx`, `SCM-HLG xxx`, trailing
  "DT" suffix removed.
- Unmatched DT correction works.
- Google Sheet sync works with a compatible Apps Script.
- Decimal separator selector works.
- TSV copy/paste works.
- Sticky header, sticky profile tabs, and bottom action bar work.
