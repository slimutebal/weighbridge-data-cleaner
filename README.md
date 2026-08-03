# Weighbridge Data Cleaner

Offline-first local web app for cleaning weighbridge Excel source files.

See `docs/INFRASTRUCTURE_BLUEPRINT.md` for the confirmed infrastructure reference,
`docs/CLEANING_LOGIC_SPEC.md` for the exact cleaning rules per profile, and
`docs/LEGACY_PARITY_PROFILE.md` for the legacy baseline this app targets.

**Status: v0.2 Operational Pilot — PASS.** v1.0 preparation is now in its
final release checklist stage — v1.0 has **not** been tagged yet. Use
remains controlled; additional real-file evidence can continue to be
appended to `docs/PILOT_VALIDATION_LOG.md`.

For day-to-day controlled operational use, see
[docs/OPERATOR_GUIDE.md](docs/OPERATOR_GUIDE.md). For the remaining
pre-v1.0.0 sign-off steps, see
[docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

Before v1.0, the app goes through an operational pilot that validates real
operational files (not just the fixed reference samples) against the
legacy workbook, run manually by a tester:

- [docs/PILOT_TEST_GUIDE.md](docs/PILOT_TEST_GUIDE.md) — step-by-step manual
  test procedure.
- [docs/PILOT_VALIDATION_LOG.md](docs/PILOT_VALIDATION_LOG.md) — validation
  matrix, issue log, and pass/fail decision record.
- [docs/PILOT_EXIT_CRITERIA.md](docs/PILOT_EXIT_CRITERIA.md) — the
  PASS / PASS WITH ISSUES / REVISE / REJECT criteria used to score the
  pilot.

## Opening the app locally

This is a static HTML/CSS/JavaScript app — no build step, no server-side code.

1. Open this folder in VS Code.
2. Install the "Live Server" extension if prompted (already recommended in
   `.vscode/extensions.json`).
3. Right-click `index.html` → **Open with Live Server**.

Opening `index.html` directly by double-clicking it (`file://`) will not work
reliably — the app's JavaScript modules and configuration files require a real
`http://` origin to load.

Once running, the app can also be opened as its own window via the
browser's "Install" / "Create shortcut..." feature (Chrome/Edge) and pinned
to the Windows Start menu — it keeps its own app icon and window, separate
from a regular browser tab, using only the same static files above. This
app does not implement a formal PWA (no manifest, no service worker, no
offline install prompt) — see "Current MVP limitations" below.

The technology boundary is intentional and unchanged across every
revision: static HTML, CSS, and JavaScript only — no Python, no backend
service, no database, no build step/bundler, and no UI framework
dependency.

This app is built and tested **PC/desktop-first** for weighbridge
operational use. Narrower/mobile widths remain fully functional (no
horizontal overflow, controls stay reachable, results stay readable) but
are a compatibility fallback, not the primary design target.

## Sticky header, tabs, and bottom action bar

The top header stays visible while scrolling (`position: sticky`) and holds
every global control: the app title, the **Excel Decimal Format** selector,
and **Clear / Reset**. The **Theme** mode selector used to live here too —
as of Phase C1 it has moved into **Settings** (see "Settings, theme, and
language" below); the header itself never carries Theme.

A bottom action bar stays pinned to the viewport (`position: fixed`) below
all cleaning results and holds the three primary operator actions:
**Start Cleaning / Refresh Cleaning**, **Copy All Groups**, and **Copy This
Profile**. These used to be scattered across the results area (a refresh
row above the tabs, a copy button on the Overview page, a copy button on
each individual date/bucket group) — they now live in one place so they're
reachable without scrolling back up or down through a long result set.
**Copy This Profile** now copies *every* Profile + Date + Bucket group
under the active profile tab in one action (previously one button per
group); it's disabled on the Overview tab and whenever no results exist.

The **Overview / HYNC / SLNC / ESG** result tabs are also sticky
(v0.2.0-prepilot revision 7): they sit directly below the app header and
stay there while you scroll through a long validation, summary, preview, or
warning table, so switching profile pages never requires scrolling back to
the top. The tab bar's stuck position is computed from the header's actual
rendered height (`--sticky-header-height`, kept in sync by a
`ResizeObserver` in `js/main.js`) rather than a hardcoded pixel value, so it
still lines up correctly if the header wraps onto two lines at a narrow
width or its height otherwise changes. The tabs are keyboard-accessible
(standard ARIA tab pattern, arrow/Home/End navigation) — see
*Accessibility* below.

The bottom action bar's own clearance works the same way: the main content
area's bottom padding reads a measured `--bottom-action-bar-height` custom
property (kept in sync by a second `ResizeObserver`, on
`#bottom-action-bar-container`, in `js/main.js`) instead of a fixed guessed
padding value — so the last bit of page content always stays fully
scrollable above the dock regardless of button wrapping, browser zoom, or a
narrowed desktop window.

## Accessibility

The profile result tabs (**Overview / HYNC / SLNC / ESG**) use the standard
ARIA tabs pattern — `role="tablist"` on the tab bar, `role="tab"` on each
tab with `aria-selected` and `aria-controls`, `role="tabpanel"` on the
result panel, and a roving `tabindex` so only the active tab is a normal
Tab stop. With focus on a tab:

- **Left / Right arrow** — move to and activate the previous/next tab
  (wraps: last → first, first → last).
- **Home** — jump to and activate **Overview**.
- **End** — jump to and activate the last available profile tab.
- **Enter / Space** — activate the focused tab (native `<button>` behavior).

Keyboard activation always goes through the exact same tab-selection code
path as a mouse click — there is no separate keyboard-only state, and every
generated tab/panel id is stable and unique even after results re-render.

A single, persistent, visually-hidden `aria-live="polite"` region
(`js/ui/live-announcer.js`, mounted once at startup) announces key state
changes to screen readers — in addition to, never instead of, the app's
existing visible feedback (button text, status chips, warning/validation
blocks). Currently announced: removing an individual uploaded file, Clear /
Reset, Copy succeeded/failed, List DT update succeeded/failed, and
contractor-mapping sync succeeded/pending. Announcements are deliberately
short and never include raw error text, internal ids, or endpoint details.
Every announcement is translated in the currently selected language (never
both languages at once).

The **Settings** dialog (Phase C1) is a native `<dialog>`, keyboard
reachable from its trigger button, closes on Escape or its Close button,
and returns focus to the trigger on close. Its Language control uses native
radio inputs (current selection is programmatically identifiable, not
color-only); its Theme control reuses the existing theme `<select>`
unchanged. The results tablist's `aria-label`, per-file remove-button
`aria-label`s, and other translated `aria-label`/`title` attributes update
immediately when the language changes.

## Uploading Day Shift / Night Shift files

The first page has two drop zones: **Day Shift Input** and **Night Shift Input**.

1. Drag Excel files (`.xlsx` / `.xlsm`) into the matching bucket, or click a
   drop zone to browse for files.
2. The bucket you drop a file into is your *declared* shift, but it must
   actually match the file's contents — the app reads every row's own
   timestamp, classifies the file's real shift, and **rejects the file
   on the spot if it belongs in the other bucket** (see "Wrong shift
   bucket rejection" below). It never silently accepts a file into the
   wrong bucket.
3. As soon as a file is accepted, the app reads it in the browser, detects
   the profile (HYNC / SLNC / ESG), cleans the rows, and groups the results
   for output by **Profile + Date + Declared Bucket** — the bucket you
   dropped the file into, not any individual row's own detected shift.
4. Each uploaded file is listed with its own **×** remove button. Removing
   one file keeps every other file in both buckets, in their original
   order, and immediately re-runs cleaning against whatever files remain —
   no re-upload needed. Removing the last file in a bucket returns that
   bucket to its empty state while the other bucket (and its results) is
   untouched; if both buckets end up empty, the results area returns to its
   normal no-files state. Removal is tracked by an internal per-upload
   identifier, not by filename, so two files that happen to share a name
   are never confused with each other.
5. Click **Clear / Reset** in the header to immediately remove every
   uploaded file in both buckets and all cleaning results in one step —
   the global "start completely over" action. It never asks for
   confirmation.

## Wrong shift bucket rejection

Before a file is added to a bucket's file list (and before it can reach
cleaning at all), the app determines that file's **file-level detected
shift** from its own detail rows:

- Every detail row is classified DS or NS from its own timestamp (the same
  per-row classification used elsewhere in the app); non-detail/report rows
  (headers, subtotals, blanks) are ignored, and rows with an unparseable
  timestamp are counted separately as "Unknown" rather than folded into
  either count.
- **Majority wins:** if DS rows outnumber NS rows, the file's detected
  shift is Day Shift, and vice versa. A small number of boundary rows on
  the "wrong" side of the shift window (e.g. a file starting a few minutes
  before/after the shift boundary) does **not** flip the file's detected
  shift or get it rejected — those rows still show up individually in that
  profile's **Shift Warning Rows** table after the file is accepted, exactly
  as before.
- If DS and NS rows are tied (including both zero, e.g. a file with no
  readable timestamps at all), the file's shift is **ambiguous** and it is
  rejected regardless of which bucket it was dropped into.

If the file's declared bucket doesn't match its detected shift, or the
detected shift is ambiguous, a popup appears immediately: the file is
**not** added to the bucket's file list, not included in Start/Refresh
Cleaning, and never reaches Overview or any profile page. The popup names
the file, the bucket you chose, the detected shift, the DS/NS/Unknown row
counts, and tells you which bucket to use instead. If several files are
rejected from one drag-and-drop or file-picker selection, one combined
popup lists all of them; files that passed validation in that same
selection are still accepted normally. A file whose profile can't be
detected at all (not HYNC/SLNC/ESG) is *not* rejected by this check — it's
still accepted and reported by the existing "Could not detect profile"
message once cleaning runs, since there's no shift to validate in that
case.

## Operational report date and worksheet scope

The **Date** in Profile + Date + Bucket always comes from the source
workbook's own report-date column, never from a row's own weigh-in
timestamp:

- HYNC / SLNC: the raw **日期** column.
- ESG: the raw **TANGGAL** column.

This matters for Night Shift files, whose row timestamps legitimately cross
midnight (e.g. some rows at 23:50, others at 00:15 the next calendar day).
Because grouping uses the report-date column and not the timestamp, a Night
Shift file stays in **one** operational group as long as its report-date
column holds one value — it is never split into two date groups just
because individual rows' clock times rolled over midnight.

The row-level timestamp (毛重时间 / JAM TIMBANG ISI) is still fully
preserved and used for: row-level shift detection, the **Shift Warning
Rows** table (shown as a full date+time, e.g. `2026-07-07 23:52:10`, since
that's exactly what needs reviewing there), and the **Datetime** output
column. The clean output **TANGGAL** column itself is always date-only
(e.g. `2026-07-07`) and always reflects the report-date column, not the
timestamp.

**Only the first worksheet of each uploaded workbook is processed for
detail rows.** HYNC/SLNC workbooks typically carry `汇总表` / `1 HARI`
summary sheets after the detail sheet, and ESG workbooks carry a summary
sheet after the detail report — these later sheets are never scanned for
raw rows, regardless of their content.

The **Start Cleaning / Refresh Cleaning** button in the bottom action bar
(labeled "Start Cleaning" before any run, "Refresh Cleaning" afterward)
re-runs cleaning against whatever files are currently selected — no
re-upload needed — using the current List DT cache and the current decimal
separator. It's disabled whenever no files are selected. This is the same
manual re-run path already used automatically after **Update List DT** and
after an Unmatched DT correction; the button just lets you trigger it
yourself at any time (e.g. after editing List DT elsewhere).

**Cleaning Results** is organized as an **Overview** page plus one page per
detected profile — only HYNC / SLNC / ESG pages that actually have uploaded
files appear. The Overview page shows a summary table (rows, net tonnage,
missing Contractor/Source/Grade counts, shift warning count, skipped-row
count) per Profile + Date + Bucket group. The bottom action bar's **Copy
All Groups** copies every profile's rows at once, from any tab.

Each profile page shows, per Profile + Date + Bucket group: a validation
report, a main **Operational Summary** table (PILE ID / Source / Contractor /
Rows / Net Total / Remark — see "Operational Summary and PILE ID integrity"
below), the by-Contractor / PILE ID / Source / Grade tables tucked under a
collapsible "Additional Breakdown" (kept for reference, no longer the primary
summary), an unmatched-DT table, a Shift Warning Rows table, and a clean
data preview. All rows for the same profile/date/bucket stay together in
one copyable block, even if some of them have a row-level detected shift
that differs from the declared bucket — see "What the warnings mean" below.
The bottom action bar's **Copy This Profile** copies every group shown on
the active profile tab (all of that profile's dates/buckets at once) when
you're on a HYNC/SLNC/ESG tab; it's disabled on Overview. Both copy actions
produce tab-separated values (TSV) with no header row by default — paste
directly into Excel.

## Updating List DT

A compact **List DT** utility bar at the top of the page (Phase C1 — the
single authoritative List DT presentation in the app; a duplicate status
block previously shown again inside Cleaning Results has been removed) shows:

- the current List DT source (`bundled`, or `cache` if previously updated),
- how many contractor records are loaded,
- how many normalized DT IDs map to conflicting contractors,
- when the List DT was last updated, and
- the current pending Google Sheet sync count.

Click **Update List DT** to fetch the latest contractor mapping from the
configured Google Sheet endpoint. This is entirely optional and manual —
the app never calls this endpoint automatically. On success, the new list is
cached in the browser's `localStorage` and any files already uploaded are
automatically re-cleaned so contractor values reflect the update.

**Sync Pending DT**, next to Update List DT in the same bar, syncs whatever
DT corrections are currently queued (see "Local pending sync and Google
Sheet sync" below) without needing to open the Overview tab — the Overview
page's own Unmatched DT Correction section (with its per-row contractor
inputs) is unchanged and still the place to *enter* new corrections; this
button is a shortcut to (re-)sync ones already saved locally.

A **Settings** button sits at the right of this same bar — see "Settings,
theme, and language" below.

## Excel decimal format

An **Excel Decimal Format** selector sits in the sticky top header, with two
options: `1.20` (dot) and `1,20` (comma) — pick whichever your Excel's
regional settings expect. Your choice is saved in the browser's
`localStorage` and always wins over the `decimalSeparator` value in
`config/app-config.json` (that config value is only the first-run default,
before you've ever picked one yourself). Changing the selector immediately
re-formats, with no re-upload needed:

- Clean Data Preview,
- **Copy This Profile** and **Copy All Groups** TSV output,
- Validation Report tonnage metrics (Raw/Clean tonnage, Tonnage difference),
- and every Net Total column (Operational Summary and the Additional
  Breakdown tables).

In every case, Net and Grade are written as plain decimal numbers with
exactly 2 decimal places, with no thousands separator and no leading
apostrophe or other text-forcing — so they paste into Excel as native
numbers, not text. Grade is stripped down to its numeric value only; a raw
value like `NI:1.20` copies as `1.20` (or `1,20`), never with the `NI:`
prefix or its parentheses.

## Settings, theme, and language

**Settings** (Phase C1) is a native `<dialog>` opened from the button at the
right of the compact List DT bar. It contains two controls:

- **Theme** — Auto / Light / Dark, moved here from the header. Behavior is
  unchanged from before: **Auto** follows the OS/browser
  `prefers-color-scheme` setting (and updates live if the OS setting
  changes), **Light** forces the light palette, and **Dark** forces the
  dark palette, regardless of OS setting. The whole UI — header, tabs,
  bottom action bar, cards, tables, forms, and every modal — is themed via
  CSS custom properties in `css/app.css`, applied instantly through a
  `data-theme` attribute on `<html>` (`js/ui/theme-selector.js`, reused
  as-is inside Settings — there is only one theme selector/state in the
  app) with no reload needed. Your choice is saved (`localStorage`, default
  Auto) and restored on the next visit. Theming is purely visual — it does
  not alter any cleaning logic, layout structure, or existing behavior.
- **Language** — **English** or **Indonesia**. Selecting a language updates
  all translated UI text immediately, in place, with **no page reload**.
  Your choice is saved in `localStorage` (`weighbridge-language`) and
  restored on the next visit; if the stored value is ever invalid, the app
  falls back to English rather than failing to start. The document's
  `<html lang>` attribute is kept in sync with the current language, both
  on first load and on every language change.

Settings closes via its **Close** button, the Escape key, or clicking
outside (native `<dialog>` behavior); focus returns to the Settings button
on close.

**Localization architecture.** All UI copy is translated through one
centralized module, `js/ui/i18n.js` — a dictionary keyed by short string
IDs (e.g. `"settings.title"`, `"listdt.update"`) with an `en` and `id` entry
each, a `t(key, params)` helper that looks up the current language and
performs `{{param}}` interpolation, and `getLanguage()` /
`setLanguage()` / `subscribeLanguage()` / `initializeLanguage()` for reading
and changing the active language. UI modules call `t()` when they render
text and, where a module stays mounted for the app's whole lifetime (the
header, the List DT bar, the bottom action bar, the results shell), they
also subscribe to language changes and re-render their own text in place.
There is no scattered `language === "id" ? ... : ...` conditional logic
anywhere outside this one module.

**Language changes never lose state.** Switching language re-renders
existing UI from data already in memory — it never reloads the page, never
re-parses uploaded Excel files, and never re-runs cleaning. Uploaded Day/
Night Shift files, current cleaning results, the active profile tab,
List DT data and pending-sync state, the Excel Decimal Format preference,
and the Theme preference are all unaffected by a language change.

**Localization is presentation-only.** Only UI chrome, labels, headings,
and messages are translated. Business data is never translated or altered:
Source values, grade codes, material codes, contractor and buyer names,
filenames, sheet names, date/time values, numeric values, PILE ID, NO.NOTA,
NO. DT, and every copied/exported TSV column name and value are identical
regardless of the selected language. Selecting Indonesian does not change
the Excel Decimal Format preference (and vice versa) — language and decimal
format are independent settings.

## Unmatched DT Correction

The Overview page has an **Unmatched DT Correction** section listing every
DT ID across the currently uploaded files whose Contractor is "Unmatched" —
one row per unique DT ID, a text input for the contractor name, and a
Status column.

**Unknown DT is standardized to canonical master format before display or
save.** The table shows the canonical master DT id, not the raw source
value — e.g. source cells reading `SCM-LIM 221 DT.`, `SCM LIM 221 DT`,
`SCM_LIM_221`, or `SCM-LIM-221-DT` all display as **`SCM-LIM 221`**;
`SCM HLG 958 DT`, `SCM-HLG 958 DT`, and `SCM_HLG_958` all display as
**`SCM-HLG 958`**. The canonical format for SCM unit ids is `SCM-<UNIT>
<NUMBER>` — a hyphen between `SCM` and the unit family (`LIM`, `HLG`,
...), a space before the number, uppercase, and the raw trailing "DT"
suffix removed regardless of how it was separated (`" DT"`, `"-DT"`,
`".DT"`, `"DT."`). Spaces, hyphens, and underscores are all treated as
equivalent separators, and runs of repeated separators collapse to one.
This canonical value (via
`toCanonicalDtId()` in `js/core/normalizers.js`) is used consistently for
the table display, the local List DT cache, the pending sync queue, and the
Google Sheet POST payload — never the raw "... DT" value. The raw source
value is still available as a hover tooltip on the DT cell for diagnostics.

Matching/duplicate-detection is kept separate from display: `normalizeDtId()`
still reduces any DT id to a fully punctuation-free key (e.g. both
`SCM-LIM 221` and `SCM LIM 221` become `SCMLIM221`) purely for comparing
whether two ids refer to the same truck. This means a Google Sheet row
already saved as `SCM HLG 958` (older, space-only format) still joins and
still de-duplicates correctly against a new correction canonicalized to
`SCM-HLG 958` — the app does not rewrite or migrate existing Google Sheet
rows; only newly saved/synced mappings use the canonical hyphenated format.

Type a contractor name into one or more rows and click **Update**. Before
writing anything, each correction is checked against the current List DT
cache/bundled map *and* the pending sync queue:

- **New** dt_id → written to the local List DT cache immediately, added to
  the pending sync queue, and all currently uploaded files are re-cleaned
  right away (no re-upload) so the corrected Contractor shows up.
- **Duplicate** (same normalized dt_id, same contractor already known
  locally) → not re-added; Status shows "Already exists / duplicate
  skipped".
- **Conflict** (same normalized dt_id, a *different* contractor already
  known locally) → not written, never silently overwritten; Status shows
  "Conflict: existing contractor differs" so it stays visible for manual
  review.

## Local pending sync and Google Sheet sync

DT corrections always apply locally first — cleaning is never blocked
waiting on a network call. Whether a correction has also reached the shared
Google Sheet is tracked separately:

- Every newly-applied correction is recorded in a local **pending sync**
  queue. The Unmatched DT Correction section shows the current pending count
  and a **Sync Pending DT** button.
- Clicking **Update** or **Sync Pending DT** is the *only* way a sync to
  Google Sheets is attempted — the app never auto-syncs on a timer or in a
  background loop.
- The sync POSTs to the same endpoint used for **Update List DT**:

  ```json
  { "action": "appendListDt", "data": [{ "dt_id": "SCM-LIM 992", "contractor": "..." }] }
  ```

  using **`Content-Type: text/plain;charset=utf-8`** (not
  `application/json`) — Google Apps Script Web Apps can trigger a CORS
  preflight on `application/json` that the endpoint may not handle, so
  `text/plain` keeps this a CORS-simple request. Only the standardized
  `dt_id` is ever sent, never a raw "... DT" value.
- The Apps Script's `appendListDt` mode is expected to do its own
  server-side duplicate prevention and report back per-DT-ID outcomes:
  `appended` / `updated_blank` (treated as synced — removed from the
  pending queue), `duplicate_skipped` (Google Sheet already had this exact
  dt_id + contractor — also removed from pending, Status shows "Already
  exists on Google Sheet"), `conflicts` (Sheet has a different contractor —
  **kept pending**, Status shows the conflict, never silently overwritten),
  and `errors` (kept pending with the endpoint's message). If the response
  doesn't use this shape at all, or isn't valid JSON, or the request fails
  for any reason (offline, CORS, endpoint doesn't support POST), the app
  does **not** fake success — the entry stays in the pending queue and
  Status shows "Saved locally, pending Google Sheet sync." Cleaning and
  contractor matching keep working normally either way; only the shared
  sheet is out of sync until a sync actually succeeds.
- This app does not modify the Apps Script itself — only how the web app
  calls it and interprets its response.

## Operational Summary and PILE ID integrity

Each profile page's main table is now the **Operational Summary**: one row
per PILE ID + Source + Contractor combination, with Rows, Net Total, and a
Remark column that flags operational issues directly on the row instead of
requiring a cross-reference to a separate issue table — Unknown DT, Missing
Source, Missing Grade, Missing PILE ID, and/or "PILE ID has multiple
Sources". Rows are sorted A-Z by PILE ID, then Source, then Contractor (not
by tonnage) so an operator can find a specific PILE ID by eye; rows with a
blank/missing PILE ID always sort to the bottom.

**PILE ID integrity rule:** within one Profile + Date + Bucket group, a
single PILE ID must resolve to exactly one Source. If it resolves to more
than one, every Operational Summary row for that PILE ID is flagged "PILE ID
has multiple Sources" (also counted in the Validation Report as "PILE ID /
Source conflicts") — this is a data-quality signal, not something the app
silently resolves for you. The reverse is expected and fine: one Source
legitimately spanning several PILE IDs is never flagged.

## Table presentation and headline metrics (Phase C2)

Each profile page's Validation Report now opens with four **headline
metric tiles** — Rows, Tonnage, Tonnage Difference, and Readiness — above
the existing detailed metric list, which remains unchanged and is still
the authoritative detail view. The tiles never recompute anything: every
figure (raw/clean row counts, raw/clean tonnage, the difference, the
readiness status) is read from the same validation and readiness objects
already used elsewhere on the page, so the tiles and the detailed report
always agree. The Readiness tile reuses the same translated readiness
label already shown on the group header chip and profile-tab badge (e.g.
"Ready", "Ready with Information", "Action Required") — never a new
readiness decision, and never color-only (the label text is always
visible alongside the tile's accent color). Tile labels ("Rows", "Tonnage",
"Tonnage Difference", "Readiness") are translated through the same
centralized `js/ui/i18n.js` module as the rest of the UI (English/
Indonesia) — see "Settings, theme, and language" above.

**Numeric columns are right-aligned** across the app's data tables (Rows,
Net/Net Total, tonnage, and count columns), while identifier/text columns
(Profile, Contractor, Source, PILE ID, NO.NOTA, NO. DT, dates) stay
left-aligned. Alignment is applied via explicit classes the renderer sets
per column identity (`table-header-numeric` / `table-cell-numeric`), never
by column position — column order, values, and the copied/exported schema
are unaffected.

**Sticky table headers** are used only where a table sits inside a real,
bounded vertical scroll region: today that's the **View All Rows** modal
table (already the case before Phase C2), which has its own fixed-height
scroll container. Every other table in the app grows with its content
(inside a collapsible section or the normal page flow) rather than
scrolling vertically inside a fixed box, so a sticky header would have
nothing to stick to there — those tables intentionally do not get one.

Data tables also get a very subtle **zebra stripe** on alternating rows
and a **row-hover highlight** on devices with a real pointer (`hover: hover`
and `pointer: fine` — never on touch-only devices, and never a "stuck"
highlight after a tap). Both are intentionally low-contrast and never
override a status-flagged row's own color (e.g. an Operational Summary row
flagged "PILE ID has multiple Sources" always keeps its own highlight,
regardless of stripe or hover).

Wide tables that scroll horizontally now show a subtle **left/right edge
fade** (`js/ui/scroll-edge-indicators.js`) indicating there are more
columns off-screen in that direction — it disappears once you've scrolled
to that edge, and never appears at all if the table doesn't overflow. It's
purely decorative (`aria-hidden`, not keyboard-focusable, never part of
copied/exported output) and supplements the table's normal scrollbar,
which remains fully usable. Every table wrapper's indicator is
reattached on re-render (profile/tab switch, language change, decimal
format change, View All open) and explicitly cleaned up beforehand, so
switching around the app repeatedly never accumulates duplicate listeners.
The Overview summary table (below) is a deliberate exception — it is
designed to never scroll horizontally in the first place, so it does not
attach an edge-fade indicator at all.

### Overview: compact columns and Copy Status

The Overview summary is a **decision summary**, not a detailed validation
table, so it stays intentionally compact: **Profile, Date, Bucket, Rows,
Net Tonnage, Missing, Information, Copy Status** — eight columns, fixed
column widths, no horizontal scrolling at any PC-first width this app
targets (1024px and up).

- **Missing** combines Missing Contractor / Missing Source / Missing Grade
  into one compact cell (e.g. `C 0 · S 0 · G 0`); hovering or using a
  screen reader exposes the full "Missing Contractor: 0. Missing Source:
  0. Missing Grade: 0." wording — the same field labels already used in
  the detailed Validation Report, not a new phrase. The underlying counts
  are unchanged; this is presentation only.
- **Information** combines Timestamp Window Notes and Skipped Rows into
  one compact cell (e.g. `Time 3 · Skip 33`), with the same full-sentence
  accessible label/title pattern. Neither value is treated as a blocker —
  that classification is unchanged.
- **Copy Status** shows a pill — **✓ Ready to Copy** (green) or **✕ Copy
  Blocked** (red), icon plus visible text, never color-only — reflecting
  the *exact same* readiness/copy-gating decision (`computeGroupReadiness`)
  that already governs the profile-tab readiness badge and the bottom
  action bar's Copy buttons. Ready and Ready with Information both show
  **Ready to Copy**; only Action Required shows **Copy Blocked**. Overview
  never computes a second copy decision.

The full, detailed Validation Report (every individual count, not the
compact combined view) remains available on each profile page — Overview
is a summary of it, never a replacement.

At narrow widths (≤640px, the same breakpoint the rest of the app already
uses for its mobile/narrow layout) the Overview table is replaced by
stacked summary cards — one card per Profile + Date + Bucket group, each
showing the same values (Rows, Net Tonnage, Missing, Information, and the
Copy Status pill) as labeled fields instead of table columns. Both the
table and the card layout are always rendered; a CSS media query, not a
JavaScript resize listener, decides which one is visible.

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

- **N row(s) have timestamps outside the declared shift window.** — shown
  on the relevant profile page for a Profile + Date + Bucket group. Some
  rows' own timestamps land in a different shift than the bucket you
  dropped the file into (e.g. a file that legitimately starts a few minutes
  before/after the shift boundary, or one file containing a genuine mix of
  Day/Night rows). These boundary rows are **not** split into a separate
  group or hidden — they stay inside the declared operational output group
  so operators can still copy/paste one contiguous block, and they are
  listed in that page's **Shift Warning Rows** table for review. The app
  never silently drops or re-buckets them.
- **N row(s) in "file" appear to be detail rows but have an invalid or
  missing timestamp and were excluded** — a real data quality issue: rows
  that look like genuine tickets (they have a ticket number and, for ESG, a
  weight) but no usable date/time. These rows are not included in any
  Profile + Date + Bucket output group.
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
- If a single uploaded file's report-date column (日期 / TANGGAL) itself
  holds more than one distinct value across its rows — a genuinely unusual
  file, not the normal case of row timestamps crossing midnight, which no
  longer causes a split — its skipped-row and lost-row counts (Overview
  page) are attributed in full to every Profile + Date + Bucket group that
  file contributes rows to, rather than split proportionally. Row-level
  data and tonnage are unaffected; only these two informational counts can
  double-count in that edge case.
- The List DT Google Sheet endpoint is expected to support the
  `appendListDt` action with the bucketed appended/updated_blank/
  duplicate_skipped/conflicts/errors response (see "Local pending sync and
  Google Sheet sync" above). If it doesn't — or returns a different shape —
  the app treats the sync as unsupported rather than faking success, and
  every DT correction stays in the local pending-sync queue indefinitely.
  Either way this does not block cleaning or contractor matching.
- Pending DT corrections and their sync status are stored per browser
  (`localStorage`), the same as the List DT cache itself — they are not
  shared across machines until a sync to Google Sheets actually succeeds.
- Localization (Phase C1) covers the UI shell, List DT, Settings, import,
  results, validation, and dialog text. A small number of dynamically
  generated messages produced by the cleaning/validation core (e.g. some
  file-level warning and error strings) remain English-only, since core
  cleaning logic files were intentionally left unmodified in this phase.
  This does not affect cleaned data, tonnage, or copied/exported output.

---

## License

This project is proprietary and not open source.

Copyright © 2026 Illofiajie. All rights reserved.

Public visibility on GitHub is provided only for deployment and maintenance purposes.  
Use, copying, modification, redistribution, rebranding, resale, or ownership claims are prohibited without prior written permission.

Authorized use is limited to the approved internal company/work environment only.
