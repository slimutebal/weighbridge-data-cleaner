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
