# Pilot Exit Criteria

This document defines the four possible outcomes of the v0.2 Operational
Pilot, recorded in `docs/PILOT_VALIDATION_LOG.md` §8. It is the scoring
rubric referenced by `docs/PILOT_TEST_GUIDE.md` and by the validation
matrix's per-row **Result** column.

## PASS

All of the following must hold across every tested file:

- No row count mismatch between the app and the legacy workbook.
- No tonnage mismatch beyond the rounding tolerance of **0.01**.
- No report-date grouping bug (rows grouped under the wrong Profile +
  Date + Bucket).
- Wrong-bucket rejection works — a file dropped into the wrong Day/Night
  zone is rejected with a clear popup and never reaches Overview or any
  profile tab.
- TSV Net/Grade paste into Excel as native numbers, not text.
- No blocking browser console errors during upload, cleaning, List DT
  update, DT correction, or TSV copy.

## PASS WITH ISSUES

All of the following hold:

- No numeric mismatch (row count or tonnage) anywhere in the tested set.
- Only minor UI issues (e.g. layout, sticky header edge cases) or known
  missing List DT entries (Unmatched DT rows that simply haven't been
  corrected yet) are present.

Pilot may proceed toward v1.0 with these issues tracked, not blocking.

## REVISE

Any of the following triggers a REVISE outcome, and the app returns to
development before re-running the pilot:

- Row count mismatch between app and legacy output.
- Tonnage mismatch beyond the 0.01 tolerance.
- Wrong report date used for grouping.
- Incorrect Source, Grade, or PILE ID derivation.
- Wrong contractor join caused by app logic (not a genuinely unmatched
  DT that hasn't been corrected — that is a PASS WITH ISSUES case, not a
  REVISE case).
- Wrong-bucket validation failure — a file accepted into the wrong
  bucket, or a correctly-bucketed file wrongly rejected.

## REJECT

Any of the following triggers a REJECT outcome:

- The app cannot reliably process supported files (HYNC/SLNC/ESG) at
  all.
- Repeated silent data loss (rows dropped without being reported as
  skipped/lost/excluded).
- Output cannot be audited — validation report figures cannot be
  reconciled against the underlying rows.

## Decision Ownership

The decision recorded in `docs/PILOT_VALIDATION_LOG.md` §8 must map to
exactly one of the four outcomes above, with rationale referencing the
specific matrix rows and/or issue log entries that drove the decision.
