# Pilot Test Guide

This guide explains how to manually run the v0.2 Operational Pilot for
the Weighbridge Data Cleaner. It assumes no build step and no backend —
the app is opened directly through Live Server, exactly as in normal
operational use. Record every result in
`docs/PILOT_VALIDATION_LOG.md`.

## 1. Open the app via Live Server

1. Open the project folder in VS Code.
2. Install the "Live Server" extension if prompted.
3. Right-click `index.html` → **Open with Live Server**.
4. Confirm the app loads at a `http://` origin (not `file://`) — the
   header, List DT panel, and two upload drop zones should all be
   visible.

## 2. Update List DT

1. Check the **List DT (Master Data)** panel: source (`bundled` or
   `cache`), record count, conflict count, last-updated time.
2. Click **Update List DT**.
3. Confirm either a success message (record count/last-updated refresh)
   or a clear failure message if offline/endpoint unreachable — the app
   must keep working with the previously cached/bundled list either way.
4. Record the List DT source and record count at test time in the log.

## 3. Upload files into correct Day/Night buckets

1. Drag or browse each pilot file into the **Day Shift Input** or
   **Night Shift Input** zone matching its actual shift.
2. Confirm the file is accepted (appears in that bucket's file list) and
   that cleaning runs automatically or after **Start Cleaning**.
3. Record Profile, Declared Bucket, and Detected Result in the
   validation matrix for each file.

## 4. Intentionally test wrong-bucket rejection

1. Pick at least one known Day Shift file and drop it into **Night Shift
   Input** (or vice versa).
2. Confirm the app rejects it immediately with a popup naming the file,
   the chosen bucket, the detected shift, and DS/NS/Unknown row counts —
   and that the file does **not** appear in Overview or any profile tab.
3. Repeat with a multi-file drop that mixes a correct and an incorrect
   file, and confirm only the wrong one is rejected while the correct
   one is still accepted.
4. Record this as its own row (or note) in the validation matrix/issue
   log — this step must pass for the pilot to reach PASS overall.

## 5. Check Overview

1. Click the **Overview** tab.
2. Confirm one row per Profile + Date + Bucket group: rows, net tonnage,
   missing Contractor/Source/Grade counts, shift warning count,
   skipped-row count.
3. Cross-check row counts and tonnage against the legacy workbook for the
   same file and record in the matrix.

## 6. Check each profile tab (HYNC / SLNC / ESG)

For each profile tab that has uploaded files:

1. Confirm the tab only appears if files for that profile were uploaded.
2. Open each Profile + Date + Bucket group and confirm it shows: a
   validation report, the Operational Summary table, the collapsible
   Additional Breakdown, an Unmatched DT table, a Shift Warning Rows
   table, and a clean data preview.

## 7. Check Validation Report

1. For each group, record Raw Tonnage, Clean Tonnage, Tonnage Difference,
   Missing Contractor, Missing Source, Missing Grade, Duplicate NO.NOTA,
   and PILE ID/Source conflict counts into the matrix.
2. Confirm the Tonnage Difference is within the 0.01 rounding tolerance
   defined in `docs/PILOT_EXIT_CRITERIA.md`, or flag it as a mismatch.

## 8. Check Operational Summary

1. Confirm one row per PILE ID + Source + Contractor combination, sorted
   A-Z by PILE ID then Source then Contractor, with blank/missing PILE
   ID rows sorted to the bottom.
2. Confirm the Remark column correctly flags Unknown DT, Missing Source,
   Missing Grade, Missing PILE ID, and "PILE ID has multiple Sources"
   where applicable.
3. Spot-check a few PILE IDs against the legacy workbook's totals.

## 9. Check Unmatched DT Correction

1. On the Overview page, confirm the **Unmatched DT Correction** section
   lists every DT ID with Contractor "Unmatched", one row per unique
   canonical DT ID.
2. Type a contractor name for at least one unmatched DT and click
   **Update**. Confirm:
   - the correction is applied immediately and affected files re-clean
     without re-upload,
   - the Status column reflects New / Duplicate / Conflict correctly,
   - the pending sync count updates and **Sync Pending DT** behaves as
     described in `README.md`.
3. Record whether any DT corrections were needed and their outcome in
   the issue log if unexpected.

## 10. Check Shift Warning Rows

1. For any group with boundary-timestamp rows, open its **Shift Warning
   Rows** table and confirm the flagged rows are genuinely near the
   shift boundary (not silently dropped or re-bucketed).
2. Confirm these rows still appear in the group's main output (Operational
   Summary / clean data preview), not removed.

## 11. Copy TSV into Excel

1. Use **Copy This Profile** (per-tab) and **Copy All Groups** (any tab)
   in the bottom action bar.
2. Paste directly into a blank Excel sheet (no "Paste Special", no
   "Text to Columns").

## 12. Verify Net and Grade are numeric

1. In the pasted Excel sheet, select the Net column and Grade column.
2. Confirm both are right-aligned and Excel's status bar shows a `SUM`/
   `AVERAGE` (numbers, not text) — no leading apostrophe, no `NI:`
   prefix on Grade, no thousands separator.
3. Confirm the decimal format (`1.20` vs `1,20`) matches the **Excel
   Decimal Format** selector chosen in the header.

## 13. Compare against legacy workbook

1. Run the same source file(s) through the existing legacy Excel +
   Power Query + Macro workflow.
2. Compare row counts, raw tonnage, and clean tonnage against the app's
   output for the same Profile + Date + Bucket group.
3. Record both values and the difference in the validation matrix.

## 14. Record result in PILOT_VALIDATION_LOG.md

1. Fill in one validation matrix row per file tested.
2. Log any discrepancy, bug, or unexpected behavior in the issue log
   table, with severity and reproduction steps.
3. Score each row Pass/Fail per `docs/PILOT_EXIT_CRITERIA.md`.
4. Complete the tester/date fields and select the overall pilot decision
   (PASS / PASS WITH ISSUES / REVISE / REJECT).
