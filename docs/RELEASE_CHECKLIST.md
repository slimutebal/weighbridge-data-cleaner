# Release Checklist — v1.0.0

Final release checklist for v1.0 preparation. This is the last step before
tagging v1.0.0; it does not itself release, tag, or push anything. Complete
this checklist (and record the decision in §10) before requesting a tag.

## 1. Release Target

- **Target release:** v1.0.0
- **Purpose:** controlled operational use of Weighbridge Data Cleaner
- **Scope:** HYNC, SLNC, ESG source Excel cleaning, with TSV output for
  Excel paste

## 2. Current Release Status

- MVP completed
- v0.2 Operational Pilot passed
- v1.0 preparation in progress
- Latest pilot tag: `v0.2.0-pilot-pass`

## 3. Pre-release Smoke Test

- [ ] Open app via Live Server / local HTTP server
- [ ] Update List DT
- [ ] Confirm List DT status
- [ ] Select decimal separator
- [ ] Upload correct Day Shift files
- [ ] Upload correct Night Shift files
- [ ] Test wrong-bucket rejection
- [ ] Confirm Overview tab
- [ ] Confirm HYNC tab
- [ ] Confirm SLNC tab
- [ ] Confirm ESG tab
- [ ] Confirm sticky header
- [ ] Confirm sticky profile tabs
- [ ] Confirm bottom action bar
- [ ] Confirm Refresh Cleaning
- [ ] Confirm Copy This Profile
- [ ] Confirm Copy All Groups
- [ ] Paste TSV into Excel
- [ ] Confirm Net and Grade paste as numbers

## 4. Data Validation Checklist

- [ ] HYNC row count correct
- [ ] SLNC row count correct
- [ ] ESG row count correct
- [ ] HYNC tonnage correct
- [ ] SLNC tonnage correct
- [ ] ESG tonnage correct
- [ ] Report date grouping correct
- [ ] Night Shift crossing midnight does not split group
- [ ] Clean output Shift follows declared bucket
- [ ] Shift Warning Rows preserve detected row shift
- [ ] PILE ID / Source integrity validation works
- [ ] Missing contractor/source/grade warnings work
- [ ] Duplicate NO.NOTA warning works

## 5. List DT Checklist

- [ ] List DT update works
- [ ] Offline/local cache works
- [ ] Unmatched DT Correction works
- [ ] Canonical DT format works:
  - `SCM-LIM xxx`
  - `SCM-HLG xxx`
- [ ] Google Sheet sync works or pending sync is clearly shown
- [ ] Duplicate/conflict handling works

## 6. Known Limitations

- No backend
- No database
- No login
- No real-time weighbridge integration
- No ODBC
- No XLSX export yet
- Theme mode may be limited/placeholder
- More real-file evidence can continue to be appended after v1.0

## 7. Release Criteria

v1.0 can be tagged only if:

- [ ] No blocking row-count mismatch
- [ ] No blocking tonnage mismatch
- [ ] No report-date grouping bug
- [ ] Wrong-bucket rejection works
- [ ] TSV paste works
- [ ] List DT workflow works
- [ ] No blocking browser console error
- [ ] Operator guide exists (`docs/OPERATOR_GUIDE.md`)
- [ ] Pilot log confirms PASS (`docs/PILOT_VALIDATION_LOG.md`)

## 8. Rollback Plan

- Previous known-good tag: `v0.2.0-pilot-pass`.
- If an issue appears in v1.0, return to the latest known-good
  commit/tag (`v0.2.0-pilot-pass` unless a later known-good tag exists)
  rather than attempting a live fix under pressure.
- Keep the existing legacy Excel + Power Query + Macro workflow available
  during the transition, so operators can fall back to it if the app is
  rolled back.

## 9. Handover Checklist

- [ ] Share app folder/repo link
- [ ] Share operator guide (`docs/OPERATOR_GUIDE.md`)
- [ ] Explain Live Server/local opening
- [ ] Explain List DT update
- [ ] Explain decimal separator
- [ ] Explain wrong-bucket rejection
- [ ] Explain unmatched DT correction
- [ ] Explain copy/paste to Excel
- [ ] Explain known limitations

## 10. Final Release Decision

- [ ] READY FOR v1.0.0 TAG
- [ ] NOT READY — issue found

**Checked by:**

**Date:**

**Notes:**
