# Decisions

This file records architecture and implementation decisions.

## D001 - App Architecture

Use a browser-based local web app with HTML, CSS, and vanilla JavaScript.

## D002 - Source Profiles

Supported profiles:
- HYNC
- SLNC
- ESG

## D003 - Shift Input

Use two input buckets:
- Day Shift Input
- Night Shift Input

The declared bucket is the final operational shift for every row in the
file (superseded by D009 — the weighbridge operation has no reliable
timestamp boundary for shift handover, confirmed during the v0.2
operational pilot; see `PILOT_VALIDATION_LOG.md` issue #1).

## D004 - Result Grouping

Group results by:

Profile + Date + Declared Bucket Shift

Row timestamps provide an informational comparison against each
profile's nominal shift window only. They never move a row to a
different group, never split one uploaded file into multiple shift
groups, and never override the output "Shift" value (D009).

## D005 - List DT

List DT requires only:
- dt_id
- contractor

## D006 - Legacy Parity Profiling

Legacy parity profiling must be documented in `docs/LEGACY_PARITY_PROFILE.md`
before writing `CLEANING_LOGIC_SPEC.md`.

## D007 - Cleaning Logic Spec Rule Ordering

Cleaning logic spec must preserve legacy compatibility first and separate
improved validation rules.

## D008 - Type and Buyer Derivation

Type and Buyer are derived from PILE ID, not from 客户类型 or
收货单位/PENERIMA/Pembeli:

- Type = EXW if PILE ID contains "EX", else DAP (all profiles).
- HYNC/SLNC Buyer = HYNC if PILE ID / 备注 contains "HY", else SLNC.
- ESG Buyer, checked in order against PILE ID: HY → HYNC, ESG → ESG,
  MEIM → MEIM, QMB → QMB, otherwise → ESG.

## D009 - Declared Bucket Is Authoritative for Shift (v0.2 Pilot Finding)

During the v0.2 operational pilot, real weighbridge operation showed
there is no reliable fixed timestamp boundary for shift handover
(`PILOT_VALIDATION_LOG.md` issue #1). One uploaded source file
represents one operational shift, chosen by the user via the input
bucket at import time. This supersedes the original D003/D004 intent
of validating/grouping by row timestamp:

- clean output "Shift" is always the file's declared input bucket
  ("DS" or "NS"), for every row, with no exceptions;
- the cleaning group key is Profile + Date + Declared Bucket Shift;
- a row's own timestamp is never used to move it to another group,
  split a file into multiple groups, or override the output Shift
  value;
- row-level timestamp classification against the profile's nominal
  shift window is preserved only as informational audit metadata
  (internal `_detectedShift` field), surfaced in the UI as Timestamp
  Window Information / Shift Window Audit Note, never as a warning
  that blocks copy/readiness.

## D010 - Row-Level Weight Integrity Is Blocking, Never Auto-Corrected (v1.1.0)

Every candidate detail row is checked for `Gross - Tare == Recorded Net`
(within a profile-configured tolerance), computed in the shared
`js/core/weight-integrity.js` module and attached to each clean row as
`_weightIntegrity` validation metadata:

- the app is a cleaning/validation tool, not an authority to rewrite
  weighbridge source values — Recorded Net (and Gross/Tare) is never
  automatically replaced by the calculated value, and the final clean
  Net / TSV output always continues to use the recorded source Net;
- an unresolved weight integrity issue (mismatch, invalid Gross/Tare/
  Recorded Net, negative weight, or Gross below Tare — see
  `CLEANING_LOGIC_SPEC.md` §19) is always blocking: it drives group
  readiness to `ACTION_REQUIRED` and disables copy for that group's
  profile/all-groups scope, through the same centralized
  readiness/copy-gating model used by every other blocking category
  (`js/core/readiness.js`) — no separate ad-hoc gating was added;
- the affected row is not dropped or hidden — it remains visible in
  Clean Data Preview and is not counted as a lost row;
- comparison happens at raw source precision and unit (integer kg for
  HYNC/SLNC, hundredths of a tonne for ESG — confirmed against the
  bundled sample files, not assumed) via decimal-safe scaled-integer
  arithmetic, never by comparing floating-point tonnage values;
- tolerance is profile-configurable (`config/app-config.json`
  `weightIntegrity.<PROFILE>.toleranceMinorUnits`), defaulting to zero at
  the confirmed source precision for all three profiles — a nonzero
  tolerance is not invented and must be justified by observed
  weighbridge behavior before being configured;
- required operational workflow on a mismatch: the app detects and
  reports it, the operator confirms the discrepancy with the weighbridge
  team, the source file is corrected outside the app, the corrected file
  is re-uploaded, and cleaning is rerun — there is no in-app "Ignore" or
  override control in this version.

## D011 - Weight Exception Resolution Is Per-Row, Session-Scoped, and Never Hides Evidence (v1.2.0)

Building on D010, `WEIGHT_CALCULATION_MISMATCH` rows can be individually
resolved via an operator-recorded "approved weight exception"
(`js/core/weight-exception-store.js`), without weakening the underlying
mathematical validation from D010:

- resolution is per source row only. There is no "Approve All", "Override
  All", or profile/group-wide override anywhere in the UI or the store's
  API — every approval is granted through a dialog scoped to one exact
  row (`js/ui/weight-exception-dialog.js`);
- an approval never mutates Gross, Tare, or Recorded Net, and never
  deletes the underlying `WEIGHT_CALCULATION_MISMATCH` evidence — the row
  stays in the same consolidated Weight Integrity Issues table with its
  original mismatch numbers, permanently, for audit;
- an approval requires an operator-entered "Confirmed by" and
  "Reference / reason" (both required); the UI carries an explicit notice
  that this is an operator-recorded declaration, not an independently
  verified identity, since the app has no login/backend;
- approvals are scoped to the current in-memory cleaning result (a
  "run"): they are bound to the current run id, the cleaning group id,
  the row's `sourceRowId`, and its Gross/Tare/Recorded Net minor-unit
  values — never to filename, row number, or NO.NOTA alone — so a changed
  source value (re-uploaded corrected file) can never inherit a stale
  approval, and a fresh Refresh Cleaning / Clear-Reset / new upload always
  starts a new run with zero approvals;
- readiness distinguishes total mathematical mismatches from unresolved
  ones: `unresolvedWeightMismatchCount = totalWeightMismatchCount -
  approvedWeightExceptionCount`. Only the unresolved count blocks copy
  (`ACTION_REQUIRED`); a group with zero unresolved mismatches but at
  least one approved exception is `READY_WITH_INFO`
  ("Siap Disalin — Pengecualian Berat Disetujui"), never plain `READY`
  — an approved exception is informational, not "fully clean";
  every other weight issue type (invalid Gross/Tare/Recorded Net,
  negative weight, Gross below Tare) has no approval workflow at all and
  stays unconditionally blocking;
- revocation ("Batalkan Konfirmasi") deletes the approval record and
  immediately restores blocking readiness for that row — it never
  deletes the row or its mismatch data;
- all weight-integrity issues for one cleaning group render inside
  exactly one panel and one table (carried over from D010, made explicit
  here because it is now load-bearing for the resolution UI too) — never
  one panel/table per mismatch row.

## D012 - Low Net Weight Confirmation Reuses the D011 Exception Model (v1.3.0)

Adds a second, independent operational validation layer: every candidate
detail row's Recorded Net (source field, never Calculated Net) is
compared against a configured minimum tonnage threshold
(`config/app-config.json` `minimumNetWeight.<PROFILE>.thresholdTonnes`,
20.00 tonnes for HYNC/SLNC/ESG today), computed in
`js/core/net-weight-validation.js` and attached to each clean row as
`_lowNetWeight`:

- Recorded Net < threshold is blocking (`LOW_NET_WEIGHT`); exactly at or
  above the threshold passes. The comparison reuses weight-integrity's
  already-parsed `recordedNetMinorUnits` and its scaled-integer
  (`parseToMinorUnits`) machinery — never a second raw-cell parse and
  never a floating-point tonnage comparison;
- invalid-weight precedence: a row whose Gross/Tare/Recorded Net is
  already invalid, negative, or Gross-below-Tare (D010's other issue
  codes) is not additionally flagged `LOW_NET_WEIGHT` for the same root
  cause — weight-integrity stays sole authority for that row. A
  `WEIGHT_CALCULATION_MISMATCH` row's Recorded Net is still a trustworthy
  parsed number, so it remains independently eligible for its own
  low-net comparison — a row can carry both issues at once;
- resolution reuses D011's exact operational model, via a parallel,
  independent session-scoped store (`js/core/low-net-weight-store.js`)
  and dialog (`js/ui/low-net-weight-dialog.js`): per-row only, "Confirmed
  by" + "Reference / reason" required, Recorded Net never mutated, the
  low-net finding never deleted from the table, approvals keyed to run
  id + group id + `sourceRowId` + `recordedNetMinorUnits` (never
  filename/row-number/NO.NOTA alone), and cleared by every path that
  starts a new run (Refresh Cleaning, Clear/Reset, new upload);
- readiness tracks `unresolvedLowNetCount` /
  `approvedLowNetExceptionCount` exactly like the weight-mismatch
  counterparts, added as its own addend into `computeGroupReadiness`'s
  blocking count (`js/core/readiness.js`) — a group with zero unresolved
  low-net rows and at least one approved exception is `READY_WITH_INFO`,
  never plain `READY`;
- rendered as its own dedicated panel ("Net Below 20 Tonnes" / collapses
  to "Net < 20 Tonnes Approved" once fully approved), positioned after
  Weight Integrity Issues and before Other Blocking Issues — never merged
  into any other panel, and never one panel per row;
- the approved 12-column TSV/clean output schema is unchanged: Recorded
  Net is what's copied, and no threshold/status/confirmation field ever
  enters the output.
