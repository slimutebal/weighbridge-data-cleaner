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

Bucket is user intent only. Actual shift must be validated from timestamps.

## D004 - Result Grouping

Group results by:

Profile + Date + Detected Shift

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
