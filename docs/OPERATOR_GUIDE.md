# Operator Guide

This guide is for the day-to-day operator running the Weighbridge Data
Cleaner in controlled v1.0 use. It assumes v0.2 Operational Pilot has
already passed (see `docs/PILOT_VALIDATION_LOG.md`) and describes the app
as it exists today — no backend, no database, browser-only.

## 1. Purpose

The app cleans **HYNC**, **SLNC**, and **ESG** weighbridge Excel source
files and produces clean, validated rows ready to paste directly into
Excel. It replaces the manual Excel + Power Query + Macro workflow for
these three profiles.

## 2. How to open the app

- Open the project folder in VS Code and use the **Live Server** extension
  (right-click `index.html` → **Open with Live Server**), or serve the
  folder with another local HTTP server.
- Do **not** rely on opening `index.html` directly by double-clicking it
  (`file://`). This does not work reliably for final operation — the app's
  JavaScript modules and configuration files require a real `http://`
  origin to load.

## 3. Before processing

1. Open the app in the browser (via Live Server / local HTTP server).
2. In the **List DT (Master Data)** panel, click **Update List DT** to
   fetch the latest contractor mapping.
3. Confirm the List DT status line: source (`bundled` or `cache`), record
   count, duplicate DT ID conflicts, and last-updated time. If the update
   fails (offline/endpoint unreachable), the app shows a failure message
   and keeps using the previously cached or bundled list — this does not
   block cleaning.
4. Select the **Excel Decimal Format** in the sticky header:
   - `1,20` (comma)
   - `1.20` (dot)

   Pick whichever matches your Excel's regional settings. Your choice is
   saved in the browser and applies to previews and copied output.
5. Optionally choose a **Theme** in the header:
   - **Auto** — follows your system's Light/Dark setting and updates live
     if you change it.
   - **Light** — forces light mode regardless of system setting.
   - **Dark** — forces dark mode regardless of system setting.

   Your choice applies immediately (no reload needed) and is saved in the
   browser, so it's remembered next time you open the app. Default is
   Auto.

## 4. Upload workflow

- **Day Shift Input** accepts Day Shift source files.
- **Night Shift Input** accepts Night Shift source files.
- Upload the **original source Excel files** (`.xlsx` / `.xlsm`) directly
  by dragging them into the matching zone or clicking it to browse. Do
  **not** paste raw table data — the app reads real workbook files.
- Supported profiles: **HYNC**, **SLNC**, **ESG**. The app auto-detects
  the profile from each file's headers; a file that doesn't match any of
  the three is reported as "Could not detect profile" and not processed.

## 5. Wrong shift bucket rejection

The bucket you drop a file into is your *declared* shift, but it must
match the file's actual contents:

- If a **Night Shift** file is uploaded into **Day Shift Input**, the app
  rejects it.
- If a **Day Shift** file is uploaded into **Night Shift Input**, the app
  rejects it.
- A file whose shift can't be determined at all (e.g. no readable
  timestamps) is also rejected as ambiguous.

Rejected files are **removed** — they are not added to the bucket's file
list and never reach cleaning, Overview, or any profile tab. A popup names
the file, the bucket chosen, the detected shift, and the DS/NS/Unknown row
counts, and tells you which bucket to use instead. Re-upload the file to
the correct bucket. If a mixed selection has both correct and incorrect
files, only the incorrect ones are rejected — the rest are accepted
normally.

## 6. Result navigation

Cleaning Results are organized as:

- **Overview** tab — one summary row per Profile + Date + Bucket group.
- **HYNC**, **SLNC**, **ESG** tabs — only appear if files for that profile
  were uploaded.

Navigation aids:

- **Sticky header** — stays visible while scrolling; holds the app title,
  Excel Decimal Format selector, Theme selector, and **Clear / Reset**.
- **Sticky profile tabs** — the Overview/HYNC/SLNC/ESG tab bar sits just
  below the header and stays visible while you scroll through a long
  result set, so switching tabs never requires scrolling back to the top.
- **Bottom action bar** — pinned to the bottom of the viewport; holds
  **Start Cleaning / Refresh Cleaning**, **Copy All Groups**, and **Copy
  This Profile**, reachable from anywhere in the results.

## 7. What to check in each profile page

Each Profile + Date + Bucket group on a profile tab shows:

- **Validation Report** — raw/clean rows and tonnage, tonnage difference,
  and the counts below.
- **Operational Summary** — one row per PILE ID + Source + Contractor,
  with a Remark column flagging issues on the row itself.
- **Clean Data Preview** — the first rows of cleaned output.
- **Shift Warning Rows** — rows whose own timestamp falls outside the
  declared shift window; they stay in the group's output, just flagged
  for review.
- **Unmatched DT Correction** (Overview page) — DT IDs with Contractor
  "Unmatched".

Also confirm these validation counts are as expected:

- Missing Contractor
- Missing Source
- Missing Grade
- Duplicate NO.NOTA
- PILE ID / Source conflicts

## 8. Report date rule

- **HYNC / SLNC** report date uses the raw **日期** column.
- **ESG** report date uses the raw **TANGGAL** column.

The report-date column — not any row's own weigh-in timestamp — decides
which Profile + Date + Bucket group a row belongs to. This means a
timestamp that crosses midnight (e.g. Night Shift rows at 23:50 and 00:15
the next calendar day) does **not** split the operational group in two, as
long as the report-date column holds one value for that file.

## 9. Shift rule

- Clean output **Shift** follows the **declared bucket** you uploaded the
  file into, not any row's own timestamp:
  - Day Shift Input → `DS`
  - Night Shift Input → `NS`
- Row-level detected shift (from each row's own timestamp) is
  **audit-only** — it never changes the output Shift value. It only
  surfaces in the **Shift Warning Rows** table when it disagrees with the
  declared bucket.

## 10. List DT / Contractor correction

- Unmatched DT IDs can be filled in on the **Overview** page, under
  **Unmatched DT Correction**: type a contractor name and click **Update**.
- DT IDs are canonicalized to a standard master format before display or
  save, for example:
  - `SCM-LIM 221 DT.` → `SCM-LIM 221`
  - `SCM-HLG 958 DT` → `SCM-HLG 958`
- The **local update** (browser cache) applies immediately — corrected
  files re-clean automatically, no re-upload needed.
- **Google Sheet sync** depends on network connectivity and endpoint
  support. If it fails or is unsupported, the correction still applies
  locally and stays in a pending queue.
- Use **Sync Pending DT** to retry any corrections still waiting to reach
  the Google Sheet.

## 11. Copy output to Excel

- **Copy This Profile** copies every group on the currently active
  profile tab (disabled on Overview).
- **Copy All Groups** copies every group across all profiles, from any
  tab.
- Paste directly into a blank Excel sheet (no "Paste Special", no "Text to
  Columns").
- **Net** and **Grade** should paste as native numbers (right-aligned,
  summable in Excel), not text.
- If Excel misreads the decimal (e.g. shows `1.20` as text when it expects
  `1,20`), switch the **Excel Decimal Format** selector and copy again —
  no re-upload needed.

## 12. Refresh Cleaning

The bottom action bar button reads **Start Cleaning** before the first run
and **Refresh Cleaning** afterward:

- Re-runs cleaning against whatever files are currently selected.
- Does **not** require re-upload.
- Useful after a List DT correction or a decimal format change (though
  both of these already trigger it automatically) — use it any time you
  want to manually re-apply the latest List DT cache or settings.

## 13. Reset

- **Clear / Reset** (top header) removes all uploaded files and clears the
  Cleaning Results (Overview and profile tabs).
- It does **not** delete Google Sheet List DT data — DT corrections
  already synced (or still pending sync) are unaffected.

## 14. Known limitations

- No backend.
- No database.
- No login.
- No ODBC / real-time weighbridge connection.
- No XLSX export yet — output is TSV-to-clipboard only.
- Theme mode (Auto/Light/Dark) is implemented and functional; further
  visual refinement can still continue after v1.0.
- Additional real-file pilot evidence can continue to be appended to
  `docs/PILOT_VALIDATION_LOG.md`.

## 15. Operator checklist

- [ ] Update List DT
- [ ] Select decimal format
- [ ] Upload files to correct bucket
- [ ] Review Overview
- [ ] Review profile tab
- [ ] Resolve unmatched DT
- [ ] Check validation warnings
- [ ] Copy TSV
- [ ] Paste into Excel
- [ ] Save/report result
