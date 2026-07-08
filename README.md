# Weighbridge Data Cleaner

Offline-first local web app for cleaning HYNC, SLNC, and ESG weighbridge Excel source files.

See `docs/INFRASTRUCTURE_BLUEPRINT.md` for the confirmed infrastructure reference,
`docs/CLEANING_LOGIC_SPEC.md` for the exact cleaning rules per profile, and
`docs/LEGACY_PARITY_PROFILE.md` for the legacy baseline this app targets.

## Opening the app locally

This is a static HTML/CSS/JavaScript app — no build step, no server-side code.

1. Open this folder in VS Code.
2. Install the "Live Server" extension if prompted (already recommended in
   `.vscode/extensions.json`).
3. Right-click `index.html` → **Open with Live Server**.

Opening `index.html` directly by double-clicking it (`file://`) will not work
reliably — the app's JavaScript modules and configuration files require a real
`http://` origin to load.

## Uploading Day Shift / Night Shift files

The first page has two drop zones: **Day Shift Input** and **Night Shift Input**.

1. Drag Excel files (`.xlsx` / `.xlsm`) into the matching bucket, or click a
   drop zone to browse for files.
2. The bucket you drop a file into is your *declared* shift — it does not
   have to match the file's contents. The app reads every row's own
   timestamp and classifies its real shift independently.
3. As soon as files are added, the app reads them in the browser, detects
   the profile (HYNC / SLNC / ESG), cleans the rows, and groups the results
   under **Cleaning Results** by **Profile + Date + Shift**.
4. Click **Clear / Reset** to remove all uploaded files and start over.

Each Cleaning Group has its own expandable panel with a validation report,
summary tables (by Contractor / PILE ID / Source / Grade), an unmatched-DT
table, a clean data preview, and a **Copy This Group** button. A
**Copy All Groups** button at the bottom copies every group's rows at once.
Both produce tab-separated values (TSV) with no header row by default —
paste directly into Excel.

## Updating List DT

The **List DT (Master Data)** section at the top of the page shows:

- the current List DT source (`bundled`, or `cache` if previously updated),
- how many contractor records are loaded,
- how many normalized DT IDs map to conflicting contractors, and
- when the List DT was last updated.

Click **Update List DT** to fetch the latest contractor mapping from the
configured Google Sheet endpoint. This is entirely optional and manual —
the app never calls this endpoint automatically. On success, the new list is
cached in the browser's `localStorage` and any files already uploaded are
automatically re-cleaned so contractor values reflect the update.

## Offline behavior

The app is offline-first and never requires network access to clean files:

- Contractor matching uses, in priority order: the `localStorage` cache from
  a previous successful **Update List DT**, then the bundled
  `data/default-list-dt.json`.
- If **Update List DT** fails (no internet, endpoint down, bad response), the
  app shows a failure message and keeps using whatever cached or bundled
  List DT it already has — cleaning is never blocked by a failed update.
- SheetJS (the Excel-reading library) is vendored locally in `lib/sheetjs/`,
  not loaded from a CDN, so file reading works fully offline too.

## What the warnings mean

- **Mixed shift detected inside "file"** — one uploaded file contains rows
  from both Day Shift and Night Shift; the app has already split them into
  separate Cleaning Groups rather than guessing which shift the file
  belongs to.
- **"file": detected shift X does not match declared bucket Y** — a row's
  own timestamp puts it in a different shift than the bucket you dropped
  the file into. This is expected when a file legitimately starts a few
  minutes before/after the shift boundary; check the group it landed in.
- **N row(s) in "file" appear to be detail rows but have an invalid or
  missing timestamp and were excluded** — a real data quality issue: rows
  that look like genuine tickets (they have a ticket number and, for ESG, a
  weight) but no usable date/time. These rows are not in any Cleaning Group.
- **N non-detail/report row(s) in "file" were skipped** (blue, informational)
  — not a problem. ESG source files are repeated header/subtotal report
  blocks, not a single flat table; this message just confirms the app
  correctly skipped section headers, subtotal lines, and blank separator
  rows rather than treating them as data.
- **Could not detect profile** — the file doesn't match HYNC, SLNC, or ESG's
  known header signatures and was not processed at all.

## Current MVP limitations

- `data/default-list-dt.json` ships empty; until **Update List DT** is run
  successfully at least once (or a real bundled list is provided), every row
  shows Contractor = "Unmatched". This does not affect row counts or
  tonnage.
- `Source` / `Grade` parsing assumes the `"<code> (<grade>)"` pattern
  confirmed in the three reference sample files; a source file using a
  meaningfully different format for 规格 / KODE ORE may need the parser
  extended (see `docs/CLEANING_LOGIC_SPEC.md` §17, R-1).
- No XLSX export, no PWA/offline install prompt, no desktop packaging —
  output is TSV-to-clipboard only, by design for this MVP.
- No automated test suite; correctness has been validated against the three
  reference sample files in `samples/` (see `docs/LEGACY_PARITY_PROFILE.md`
  for the target row counts and tonnage).
