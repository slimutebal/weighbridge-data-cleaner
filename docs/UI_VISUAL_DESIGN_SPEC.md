# UI Visual Design Spec — Design Freeze

Status: **DESIGN FREEZE DOCUMENTATION**. This document is authoritative for
UI redesign phases **UI-4 through UI-6**. It defines the visual direction,
frozen information architecture, and feature-preservation contract for the
redesign. It does not authorize any implementation work (see §28).

This document does not change, and must never be read as changing, any
cleaning, validation, readiness, List DT, approval, TSV, or output
behavior. Where this document's redesign proposals (page layout, section
grouping, component placement) differ from the current UI's physical
layout, that is a **presentation-location** change proposed for a future
phase — never a computation, gating, or data-shape change. Current
implemented behavior and `docs/DECISIONS.md` are authoritative over older
blueprint language wherever the two conflict (see §30).

---

## 1. Design Purpose

The redesign objective is:

- A Windows-friendly, offline-first operational weighbridge cleaning
  application.
- Desktop/laptop-first.
- Mature corporate operational software.
- Industrial Operations Console visual direction.
- Light theme as the primary reference design.
- Soft light-gray application background.
- White work surfaces.
- Compact, data-dense layout.
- Minimal decorative elements.
- Strong visual priority for readiness, blockers, and operator actions.
- Correctness, auditability, and operational reliability are more
  important than visual novelty.

**The interface must visually emphasize what requires operator action, not
what merely exists.**

---

## 2. Hard Behavior Freeze

The UI redesign **may** change:

- layout
- navigation presentation
- typography
- spacing
- colors
- visual hierarchy
- card/table composition
- responsive presentation
- dialogs and visual component composition

The UI redesign **must not** change:

- cleaning logic
- HYNC / SLNC / ESG profile rules
- source detection behavior
- cleaning group authority
- declared bucket shift authority
- validation calculations
- readiness authority
- copy gating
- approval semantics
- approval lifecycle
- List DT persistence / sync behavior
- TSV generation behavior
- Recorded Net values
- output schema
- output column order

No redesign phase may silently introduce a feature change. Any behavior
change must be handled as a separately authorized feature change.

---

## 3. Authoritative Shift Model

**Declared Bucket is the final shift authority** (D009, `DECISIONS.md`).

One source file represents one operational shift.

**Cleaning Group = Profile + Date + Declared Bucket Shift.**

Row timestamp classification is informational audit metadata only
(internal `_detectedShift`, surfaced as Shift Warning Rows / Timestamp
Window Information). Timestamp classification must never:

- split a source file into output shifts;
- move rows between Day and Night;
- override the declared bucket;
- change the final output `Shift` value.

Wrong-bucket prevalidation (`js/ui/wrong-bucket-modal.js`,
`js/core/shift-bucket-validator.js`) may still reject obvious incorrect
file placement according to current implemented behavior: the app
classifies every detail row's own timestamp, takes a majority vote across
the file, and rejects the file outright (before it is added to either
bucket's list) if the majority shift disagrees with the declared bucket,
or if the vote is tied/ambiguous. A small minority of boundary rows on the
"wrong" side does not flip this file-level vote or cause rejection — those
rows are accepted and separately listed per-group as Shift Warning Rows.
This is a pre-upload gate, distinct from the post-upload, per-row,
informational Shift Warning Rows table.

Older blueprint language (`INFRASTRUCTURE_BLUEPRINT.md` §7.4, `IV-2` in
`CLEANING_LOGIC_SPEC.md` §12) suggesting a file with mixed detected shifts
is split into multiple output groups is **obsolete** — see §30 conflict
log. Mixed-shift rows stay in one group and surface as Shift Warning Rows.

---

## 4. Main Information Architecture

The redesign is frozen to exactly **two** main pages:

- **Main Page 1 — Input & Overview**
- **Main Page 2 — Results**

No additional primary application pages may be introduced during the UI
redesign.

### Main Page Navigation Contract

**Page 1 → Page 2.** Cleaning Overview can navigate directly to the
relevant Profile and Cleaning Group in Results. An `ACTION_REQUIRED`
group may be opened directly when appropriate (see the group-selection
default rule in §8).

**Page 2 → Page 1.** Results must always provide an explicit route back
to Input & Overview.

**Navigation safety.** Navigating between Main Page 1 and Main Page 2
must not, under any circumstance:

- clear uploaded files;
- clear cleaning results;
- invalidate weight approvals (`js/core/weight-exception-store.js`);
- invalidate low-net approvals (`js/core/low-net-weight-store.js`);
- create a new cleaning run (no implicit `startNewRun()`);
- alter List DT state (cache, pending sync queue, or last-updated
  metadata).

Navigation between the two main pages is UI presentation state only —
it changes what is visible, never what is computed, stored, or approved.

---

## 5. Main Page 1 — Input & Overview

Purpose: let the operator insert source files, understand what has been
loaded, monitor cleaning status, see which cleaning groups exist,
immediately identify which groups need attention, and navigate to the
relevant result.

Required areas:

- A. Application Header
- B. Day Shift Input
- C. Night Shift Input
- D. Imported Files
- E. Compact List DT status
- F. Cleaning Overview
- G. Cleaning / reset utility actions

Day and Night input buckets (`js/ui/shift-bucket.js`,
`js/ui/import-page.js`) remain visually distinct. Both accept:

- HYNC, SLNC, ESG
- `.xlsx`, `.xlsm`
- multiple files
- drag/drop
- browse
- individual file removal (`js/ui/imported-file-list.js`)
- keyboard-accessible file input

Do not add unimplemented file metadata features — profile override,
manual source-detection override, or rich upload profiling — unless
separately authorized later. (Current implementation has no manual
profile-override control; profile detection is automatic and a failed
detection is reported as "Could not detect profile", not offered a manual
picker. This is a real gap vs. `INFRASTRUCTURE_BLUEPRINT.md` §8.2's
"Unknown → show manual override" — see §30.)

Wrong Bucket validation/rejection popup (`js/ui/wrong-bucket-modal.js`)
remains available, unchanged in behavior (see §3).

---

## 6. Page 1 Cleaning Overview

Overview (`js/ui/overview-page.js`) is the only overview page. There must
**not** be a second Overview-like page inside Results.

Overview summarizes operational state; it does not reproduce detailed
result screens.

For each Profile + Date + Declared Shift group, surface:

- Profile
- Date
- Declared Shift (Bucket)
- row count
- clean/raw tonnage where appropriate
- readiness
- issue count (Missing / Information combined indicators)
- cleaning group count where multiple groups exist per profile

Readiness states (from `js/core/readiness.js`, real code enum — not
proposed): `READY`, `READY_WITH_INFO`, `ACTION_REQUIRED`, `FAILED`.

The primary questions Page 1 must answer:

1. What files did I load?
2. What cleaning groups were produced?
3. Which groups require attention?
4. Which results should I open?

Provide contextual navigation such as "View HYNC Results" / "View SLNC
Results" / "Review ESG Issues", opening the relevant profile/group context
directly in Results.

---

## 7. Main Page 2 — Results

Results contains profile sub-pages only: **HYNC / SLNC / ESG**. There is
no Results Overview tab.

```
[ HYNC ] [ SLNC ] [ ESG ]
```

Only profiles present in the current run are shown (current behavior,
`js/ui/result-page.js` tab rendering). The implementation may remain a
single Results workspace driven by state rather than separate physical
HTML pages — this already matches the current single-page-app structure
(`js/ui/result-page.js` + `js/ui/profile-page.js` render into one DOM
shell keyed by active tab).

Conceptual state: `activeProfile`, `activeGroup`, `activeSection`.

---

## 8. Cleaning Group Model Inside Results

A profile may contain one or multiple Cleaning Groups. Cleaning Group
remains **Profile + Date + Declared Shift**.

Example:

```
ESG
- 16 May 2026 / Day
- 16 May 2026 / Night
- 17 May 2026 / Day
```

- If only **one** group exists, show it directly — do not spend screen
  space on a selector.
- If **two or more** groups exist, show a compact Cleaning Group Selector;
  each group must expose its status before being opened.

Example group card:

```
16 MAY 2026
DAY SHIFT
304 rows
ACTION REQUIRED
3 issues
```

If a profile is opened from Page 1 because it has an issue, prefer
selecting: first an `ACTION_REQUIRED` group, otherwise a
`READY_WITH_INFO` group, otherwise a sensible latest/default group. This
is a selection-default rule for the UI layer only — it must not change
`js/core/group-key.js` grouping logic.

---

## 9. Selected Group Structure

Inside the selected Cleaning Group, show: Profile, Date, Declared Shift,
Readiness, blocking/information summary, headline metrics.

Then exactly three primary result sections, implementable as
tabs/sub-navigation within the Results workspace:

```
[ Summary ] [ Validation & Issues ] [ Clean Data ]
```

---

## 10. Summary Section

Purpose: operational understanding of the selected group.

Required content: headline metrics, rows, raw/clean tonnage, tonnage
difference, readiness, and the existing main Operational Summary table
(PILE ID / Source / Contractor / Rows / Net Total / Remark).

Existing additional breakdowns remain available: Contractor, PILE ID,
Source, Grade — currently under a collapsible "Additional Breakdown"
(`js/ui/profile-page.js`). Keep these collapsible/progressively disclosed
rather than all expanded simultaneously.

Do not change the calculations behind these summaries
(`js/core/report-builder.js`, `js/core/validation-engine.js`).

---

## 11. Validation & Issues Section

Purpose: the operator's primary investigation and correction workspace.

Organize existing validation information into logical visual groupings
(visual groupings only — no calculation or classification changes):

**Data Reconciliation** — Raw Rows, Clean Rows, Lost Rows / skipped-row
counts (ESG report-block skips where applicable).

**Tonnage** — Raw Tonnage, Clean Tonnage, Difference.

**Required Data** — Missing Contractor, Missing Source, Missing Grade,
Unmatched DT.

**Integrity** — Duplicate NO.NOTA, PILE ID / Source Conflict, Timestamp
Window information (Shift Warning Rows).

**Weight** — Weight mismatch (`WEIGHT_CALCULATION_MISMATCH`), invalid
Gross (`INVALID_GROSS_WEIGHT`), invalid Tare (`INVALID_TARE_WEIGHT`),
invalid Recorded Net (`INVALID_RECORDED_NET_WEIGHT`), Gross below Tare
(`GROSS_BELOW_TARE`), negative weight (`NEGATIVE_WEIGHT_VALUE`), Low Net
Weight (`LOW_NET_WEIGHT`).

Issue-driven presentation rules:

- zero-count healthy items should not dominate the screen;
- unresolved blocking issues should be visually prominent;
- informational issues should be visually subdued;
- approved exceptions must remain visible/auditable (never hidden once
  approved — D011/D012).

---

## 12. Unmatched DT / New Unit Workflow

**Design-freeze decision.** The primary investigation and correction
workflow for unmatched DT must live **inside the affected Cleaning
Group**: Results → Profile → Cleaning Group → Validation & Issues →
Unmatched DT / New Unit.

Reason: the operator needs row-level operational context to determine the
contractor.

The correction view should expose enough existing row context to identify
the unit, where available: DT ID (canonical + raw tooltip, per
`toCanonicalDtId()` in `js/core/normalizers.js`), PILE ID, Source,
NO.NOTA, current Contractor state ("Unmatched"), and other relevant row
context already available in cleaned/source data. The operator enters/
selects the contractor directly from this context.

**Conflict with current implementation — noted, not silently resolved.**
Today, `js/ui/profile-page.js` renders a read-only "Unmatched DT Rows"
table per Cleaning Group, but the actual *correction* control (contractor
text input + Update button) lives centrally on
`js/ui/overview-page.js`'s "Unmatched DT Correction" section, which
collects one row per unique unmatched DT ID **across all currently
uploaded groups combined**, not scoped to one group. This design freeze
explicitly rejects that centralized-only model for future phases (UI-5C):
correction must become contextual per Cleaning Group. Overview may still
surface an "Unmatched DT: N" count with navigation into the relevant
group, but Overview's role becomes summary/navigation, not the correction
surface. This is a planned **UI relocation**, to be executed in a later,
separately authorized implementation phase — it does not change List DT
matching, persistence, or sync logic in any way.

The existing List DT behavior remains authoritative and unchanged:
normalize DT ID, detect duplicate mappings, detect conflicts, write local
mapping, queue pending sync when applicable, attempt Google sync when
applicable, continue functioning offline, re-clean after an applied
mapping. Do not silently overwrite conflicting mappings.

---

## 13. Weight Integrity Workflow

Preserve current behavior exactly (D010, D011).

- Recorded Net remains authoritative for output.
- Never auto-correct Gross, Tare, or Recorded Net.
- Calculation mismatch (`WEIGHT_CALCULATION_MISMATCH`) can be confirmed
  per row only, via `js/ui/weight-exception-dialog.js`.
- Every other weight issue class (`INVALID_GROSS_WEIGHT`,
  `INVALID_TARE_WEIGHT`, `INVALID_RECORDED_NET_WEIGHT`,
  `NEGATIVE_WEIGHT_VALUE`, `GROSS_BELOW_TARE`) remains blocking/
  non-actionable — no approval workflow exists for these.
- No Approve All / Override All anywhere.
- Confirmation evidence (Confirmed By, Reference/Reason, optional Notes)
  remains visible and required (Confirmed By + Reference/Reason).
- Approval is run/session-scoped (`js/core/weight-exception-store.js`).
- Revoke ("Batalkan Konfirmasi") remains supported and restores blocking
  readiness immediately.
- Approval must not erase the original finding — the row stays in the
  same table, permanently, for audit.
- `READY_WITH_INFO` continues to be used where appropriate after approved
  exceptions (never plain `READY`).

---

## 14. Low Net Weight Workflow

Preserve current behavior exactly (D012).

- Recorded Net < 20.00 t: blocking until confirmed (`LOW_NET_WEIGHT`).
- Recorded Net == 20.00 t: safe boundary (passes).
- No Approve All.
- Per-row confirmation and revoke remain
  (`js/core/low-net-weight-store.js`, `js/ui/low-net-weight-dialog.js`).
- Approved evidence remains visible.
- The original Recorded Net value remains unchanged.
- Low Net Weight remains its own dedicated panel, separate from Weight
  Integrity, positioned after Weight Integrity Issues and before Other
  Blocking Issues — they represent different operational conditions and
  must not be merged.

---

## 15. Clean Data Section

Clean Data is a dedicated selected-group section.

- Default preview remains limited to current behavior (25 rows).
- View All Rows (`js/ui/view-all-modal.js`) remains available and must
  continue using the actual cleaned output rows, not a separate
  transformation.
- Preserve: horizontal scrolling, vertical scrolling, scroll-edge
  indicators where currently supported (`js/ui/scroll-edge-indicators.js`),
  focus restoration, modal close behavior.

---

## 16. Authoritative Clean Output Schema

Freeze this exact 12-column order (matches `js/core/output-formatter.js` /
`js/core/tsv-exporter.js` implementation, **not** the older 13-column
blueprint list — see §30):

```
1. TANGGAL
2. NO. DT
3. Contractor
4. Shift
5. Datetime
6. NO.NOTA
7. Type
8. Buyer
9. Net
10. PILE ID
11. Source
12. Grade
```

Profile is internal only and must **not** be added to copied clean
output. TSV remains the primary Excel-paste output. Do not alter default
header behavior (`includeHeader: false`) unless separately authorized.

---

## 17. Copy Actions

Preserve current implemented copy scopes during redesign:

- **Copy This Profile** — copies every Profile + Date + Bucket group under
  the active profile tab; disabled on Overview and whenever no results
  exist.
- **Copy All Groups** — copies every group across every profile, from any
  tab.

Do **not** add "Copy This Group" during UI redesign unless separately
authorized as a feature. (Older `INFRASTRUCTURE_BLUEPRINT.md` §9.1/§11
language described "Copy This Group" as the primary output action; current
implementation replaced per-group copy with the two profile/all-groups
scopes documented above — see §30 conflict log.)

Copy remains blocked according to the existing centralized readiness
authority (`js/core/readiness.js`) — the UI must never reproduce
readiness/copy calculations independently. Disabled copy actions should
clearly communicate why copying is unavailable where practical.

---

## 18. List DT

List DT remains a utility/master-data capability. Required information:
current source (bundled/cache), record count, duplicate/conflicting DT
count, last updated timestamp, pending sync count, Update List DT, Sync
Pending DT, and update/sync feedback — matching the current compact List
DT bar (`js/ui/list-dt-page.js`).

List DT may use a compact status representation in the main shell.
Detailed List DT utility UI may be opened separately as a secondary
surface/dialog/panel. Do not create another primary main page for it.

Per §12, unmatched DT correction is primarily contextual inside affected
Cleaning Groups going forward, not exclusively inside the List DT utility
or Overview.

---

## 19. Settings

Preserve the existing split between the Settings dialog and the
application header utility — this is a frozen, deliberate separation, not
two competing homes for the same control:

- **Settings dialog** (`js/ui/settings-panel.js`) — **Language** (EN/ID)
  and **Theme** (Auto/Light/Dark) only.
- **Application header utility** — **Excel Decimal Format**
  (`js/ui/decimal-format-selector.js`), which stays in the sticky app
  header, not inside Settings.

Do not define a duplicate Decimal Format control in both locations —
there is exactly one Decimal Format control, in the header, matching
current implemented behavior and its existing `localStorage` persistence.
Light theme is the primary design reference; Dark mode remains supported.
Settings remains a secondary dialog/panel, not a main page.

---

## 20. Visual Design System

**Visual direction:** Industrial Operations Console. **Primary theme:**
Light.

**Base visual system:** soft light-gray app background; white surfaces;
subtle borders; minimal shadows; restrained semantic colors; compact
density; strong table readability.

**Typography:** prefer local/system fonts (Segoe UI / system-ui). No
unnecessary external font dependency.

Recommended hierarchy:

| Element | Size |
|---|---|
| App title | ~18–20px |
| Page title | ~24–28px |
| Section title | ~16–18px |
| Body | ~13–14px |
| Table | ~12–13px |
| Metadata | ~11–12px |
| Large metric values | ~22–28px |

**Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 px. Typical: component gap
8–12px, card padding ~16px, section gap ~24px, page padding ~24–32px.

**Border radius:** controls 5–6px, surfaces/cards ~8px, dialogs ~10px,
status pills may be fully rounded. Avoid an overly rounded consumer-SaaS
appearance.

**Shadows:** use sparingly — dialogs, and floating/sticky command
surfaces where necessary (the existing sticky header, sticky result tabs,
and fixed bottom action bar are examples of surfaces that may warrant a
shadow).

---

## 21. Semantic Color Rules

- **Green** — READY / successful completion.
- **Blue or neutral informational** — information / `READY_WITH_INFO`
  where appropriate.
- **Amber** — attention / caution.
- **Red** — unresolved blocker / `ACTION_REQUIRED` / `FAILED`.
- **Gray** — neutral metadata.

Do not make entire cards heavily colored when only a small status element
needs emphasis. Do not rely on color alone — pair with text and/or icon
status indicators (matches current Copy Status pill pattern in
`js/ui/overview-page.js`, which already uses icon + text, never
color-only).

---

## 22. Table Design

Tables are a primary operational component. Design for dense but readable
data:

- subtle header background, clear header weight;
- thin row separators;
- compact row height (~32–36px where feasible);
- numeric values right-aligned, text left-aligned (matches existing
  `table-header-numeric` / `table-cell-numeric` classing, set by column
  identity, never by position);
- restrained hover treatment (pointer-only, never sticky on touch —
  existing behavior);
- sticky headers only where a table sits inside a real bounded vertical
  scroll region (currently only View All Rows);
- horizontal scrolling for wide data, with existing scroll-edge
  indication behavior retained where relevant.

Do not convert operational tables into oversized cards.

---

## 23. Action Hierarchy

- **Primary** — high-value current workflow actions.
- **Secondary** — supporting actions.
- **Danger** — destructive/reset confirmation where relevant (Clear/
  Reset).
- **Ghost/Icon** — small utility actions.

Do not create multiple duplicate actions for the same operation in
competing locations. A sticky command/action area may be used to keep
Refresh Cleaning, Copy This Profile, and Copy All Groups reachable
(matches the existing fixed bottom action bar, `js/ui/action-bar.js`), but
behavior and copy gating must remain current-authority driven.

---

## 24. Secondary Surfaces

These remain secondary dialogs/modals/panels, never primary pages:

- Wrong Bucket (`js/ui/wrong-bucket-modal.js`)
- Weight confirmation (`js/ui/weight-exception-dialog.js`)
- Low Net confirmation (`js/ui/low-net-weight-dialog.js`)
- View All Rows (`js/ui/view-all-modal.js`)
- Settings (`js/ui/settings-panel.js`)
- Detailed List DT utility, as appropriate

Preserve accessibility behavior: keyboard access, focus restoration,
native `<dialog>` semantics where currently implemented, ARIA navigation
(tablist pattern on result tabs), live announcements
(`js/ui/live-announcer.js`), Escape-to-close where appropriate.

---

## 25. Responsive Priority

Primary redesign targets: **1920×1080, 1600×900, 1366×768** — laptop/
desktop operational use is primary. Tablet is secondary. Mobile only
requires basic survivability during MVP and is not a redesign priority
(matches current README statement: PC/desktop-first, narrow widths are a
compatibility fallback down to a ≤640px stacked-card breakpoint on
Overview, not the primary target).

---

## 26. Required UI States

The design system must support at minimum the following states. Where a
state corresponds to an existing code enum, that is noted; the remainder
are design-system states for the redesigned component library (input/
upload feedback, dialogs) and do not imply new code enums are required.

**Group/page readiness** (real enum, `js/core/readiness.js`): `READY`,
`READY_WITH_INFO`, `ACTION_REQUIRED`, `FAILED`.

**Import/process flow** (design-system states, not a literal existing
enum): `EMPTY`, `FILES_SELECTED`, `PROCESSING`.

**Bucket validation:** `WRONG_BUCKET`.

**Unmatched DT:** `UNMATCHED_DT`.

**Weight integrity:** `WEIGHT_UNRESOLVED`, `WEIGHT_APPROVED`.

**Low net weight:** `LOW_NET_UNRESOLVED`, `LOW_NET_APPROVED`.

**Copy gating:** `COPY_ALLOWED`, `COPY_BLOCKED`.

**List DT:** `LIST_DT_READY`, `LIST_DT_UPDATING`, `LIST_DT_UPDATE_FAILED`,
`LIST_DT_SYNC_PENDING`.

**Secondary surfaces:** `VIEW_ALL_ROWS`, `SETTINGS`.

---

## 27. Feature Preservation Matrix

| Feature | Frozen redesign home | Current module |
|---|---|---|
| DS upload | Page 1 — Day Shift Input | `js/ui/shift-bucket.js`, `import-page.js` |
| NS upload | Page 1 — Night Shift Input | `js/ui/shift-bucket.js`, `import-page.js` |
| File remove | Page 1 — Imported Files | `js/ui/imported-file-list.js` |
| Wrong-bucket validation | Page 1 — rejection popup (secondary surface) | `js/ui/wrong-bucket-modal.js`, `js/core/shift-bucket-validator.js` |
| List DT status | Page 1 — Compact List DT status | `js/ui/list-dt-page.js` |
| List DT update | Page 1 — Compact List DT status / detailed List DT surface | `js/core/list-dt-manager.js` |
| Pending sync | Page 1 — Compact List DT status | `js/core/list-dt-manager.js` |
| Cleaning groups | Page 1 Overview + Results group selector | `js/core/group-key.js` |
| Readiness | Page 1 Overview, Results group header/tab badge | `js/core/readiness.js` |
| Group issue counts | Page 1 Overview | `js/ui/overview-page.js` |
| Profile navigation | Results — HYNC/SLNC/ESG tabs | `js/ui/result-page.js` |
| Multiple Date/Shift groups | Results — Cleaning Group Selector | `js/core/group-key.js` |
| Main operational summary | Results → Group → Summary | `js/core/report-builder.js`, `profile-page.js` |
| Contractor breakdown | Results → Group → Summary (collapsible) | `js/ui/profile-page.js` |
| PILE ID breakdown | Results → Group → Summary (collapsible) | `js/ui/profile-page.js` |
| Source breakdown | Results → Group → Summary (collapsible) | `js/ui/profile-page.js` |
| Grade breakdown | Results → Group → Summary (collapsible) | `js/ui/profile-page.js` |
| Validation report | Results → Group → Validation & Issues | `js/core/validation-engine.js` |
| Timestamp information | Results → Group → Validation & Issues (Integrity) | `js/core/shift-classifier.js` |
| Unmatched DT (view) | Results → Group → Validation & Issues (Required Data) | `js/ui/profile-page.js` |
| Unmatched DT (correction) | Results → Group → Validation & Issues — **relocated from Overview, see §12** | `js/ui/overview-page.js` today; target `profile-page.js`/group view |
| Duplicate NO.NOTA | Results → Group → Validation & Issues (Integrity) | `js/core/validation-engine.js` |
| Missing contractor/source/grade | Results → Group → Validation & Issues (Required Data) | `js/core/validation-engine.js` |
| PILE ID/source conflict | Results → Group → Validation & Issues (Integrity) | `js/core/validation-engine.js` |
| Lost-row reconciliation | Results → Group → Validation & Issues (Data Reconciliation) | `js/core/validation-engine.js` |
| Weight Integrity | Results → Group → Validation & Issues (Weight) | `js/core/weight-integrity.js` |
| Weight confirmation | Results → Group → Validation & Issues (Weight) | `js/ui/weight-exception-dialog.js` |
| Weight revoke | Results → Group → Validation & Issues (Weight) | `js/core/weight-exception-store.js` |
| Low Net | Results → Group → Validation & Issues (Weight, own panel) | `js/core/net-weight-validation.js` |
| Low Net confirmation | Results → Group → Validation & Issues (Weight, own panel) | `js/ui/low-net-weight-dialog.js` |
| Low Net revoke | Results → Group → Validation & Issues (Weight, own panel) | `js/core/low-net-weight-store.js` |
| Clean Data preview | Results → Group → Clean Data | `js/ui/profile-page.js` |
| View All | Results → Group → Clean Data (secondary surface) | `js/ui/view-all-modal.js` |
| TSV Copy This Profile | Sticky bottom action bar | `js/ui/action-bar.js` |
| TSV Copy All | Sticky bottom action bar | `js/ui/action-bar.js` |
| Settings | Secondary dialog, trigger in List DT bar | `js/ui/settings-panel.js` |
| Decimal format | Sticky app header | `js/ui/decimal-format-selector.js` |
| Language | Settings dialog | `js/ui/i18n.js` |
| Theme | Settings dialog | `js/ui/theme-selector.js` |

Every feature has one clear primary home.

---

## 28. Implementation Roadmap After Design Freeze

Implementation is **not authorized** by creation of this document alone.

Future phases:

- **UI-4** — Component Foundation
- **UI-5A** — Input & Overview
- **UI-5B** — Results
- **UI-5C** — Validation & Exceptions (including the Unmatched DT
  relocation from §12)
- **UI-5D** — List DT & Secondary Screens
- **UI-6** — Operational Regression & Polish

DESIGN FREEZE does not automatically authorize UI-4.

---

## 29. Design Freeze Acceptance Criteria

DESIGN FREEZE is **PASS** only if:

1. Exactly two main pages are defined: Input & Overview, Results.
2. Results contains HYNC / SLNC / ESG profile navigation and no
   duplicated Results Overview page.
3. Multiple Profile + Date + Declared Shift groups are explicitly
   supported.
4. Every existing audited UI feature has a defined redesign home (§27).
5. Blocking readiness and copy state cannot be hidden by navigation.
6. Unmatched DT correction is contextual to the affected Cleaning Group
   and provides row context needed for investigation (§12).
7. No cleaning, validation, readiness, List DT, approval, TSV, or output
   behavior is changed.
8. The authoritative 12-column output schema is preserved (§16).
9. No unimplemented blueprint-only feature is silently introduced.
10. UI implementation has not started.

---

## 30. Conflicts Found Between Current Implementation / DECISIONS.md / Older Blueprint

This is the consolidated conflict log referenced from the introduction,
§3, §5, §16, and §17 above.

1. **Cleaning Group key wording.** `CLEANING_LOGIC_SPEC.md` §4 still
   states "Cleaning Group = Profile + Date + **Detected** Shift" and §12
   IV-1 says row-level `classifyShift()` "is what actually determines
   which Cleaning Group a row belongs to." This is superseded by D009 and
   contradicted by IV-7 in the same document, which states the
   as-implemented behavior in `cleaning-orchestrator.js` groups by
   **declared bucket**, not detected shift. **Resolution: D009 / current
   implementation (declared bucket) is authoritative**, per this task's
   explicit instruction. This spec uses "Declared Bucket Shift"
   throughout.

2. **Mixed-shift-in-file handling.** `INFRASTRUCTURE_BLUEPRINT.md` §7.4
   and `CLEANING_LOGIC_SPEC.md` IV-2 describe splitting a file with mixed
   detected shifts into separate output groups. IV-7 (same document)
   explicitly states this was "never implemented" — mismatched rows are
   instead surfaced as Shift Warning Rows within the single declared-
   bucket group. **Resolution: current implementation (single group +
   Shift Warning Rows) is authoritative.**

3. **Output schema column count.** `INFRASTRUCTURE_BLUEPRINT.md` §12
   lists a 13-column schema ending in `..., Grade, Profile`. Current
   implementation (`js/core/output-formatter.js` /
   `js/core/tsv-exporter.js`) and this task's brief both specify the
   12-column schema with Profile excluded from output (confirmed also by
   commit `0951189` "exclude profile from clean data output").
   **Resolution: 12-column schema (§16) is authoritative.**

4. **Copy action granularity.** `INFRASTRUCTURE_BLUEPRINT.md` §9.1/§11
   describe "Copy This Group" (single group) as the primary output
   action. Current implementation replaced this with "Copy This Profile"
   (all groups under one profile tab) and "Copy All Groups" — there is no
   per-group copy button today. **Resolution: current implementation
   (Copy This Profile / Copy All Groups, no Copy This Group) is
   authoritative; this task's brief (§17) independently confirms Copy
   This Group must not be (re-)added without separate authorization.**

5. **Result page IA.** `INFRASTRUCTURE_BLUEPRINT.md` §9.1 depicts a
   single "Cleaning Results" page with all Profile+Date+Shift groups as
   flat tabs (no separate Overview, no profile-level tabs). Current
   implementation instead puts Overview and the HYNC/SLNC/ESG profile
   tabs together inside one Results workspace, each profile tab
   containing its own Profile → Cleaning Group hierarchy (group selector
   when multiple groups exist). The frozen redesign (§4, §7) does **not**
   match either of these exactly: it keeps the existing Profile →
   Cleaning Group hierarchy, but moves Overview out of the Results
   workspace entirely, onto Main Page 1 (Input & Overview) — so Main
   Page 2 (Results) contains **only** HYNC / SLNC / ESG, with no Overview
   tab inside it. **Resolution: this is an intentional presentation/
   navigation relocation of Overview from Results to Page 1, not a
   description of already-matching current behavior — current
   implementation's Overview-inside-Results placement must not be read
   as already satisfying the frozen two-page IA. The Profile → Cleaning
   Group hierarchy itself (§8–§9) is retained unchanged from current
   implementation.**

6. **Manual profile-override control.** `INFRASTRUCTURE_BLUEPRINT.md` §8.1
   /§8.2 describes a manual `[HYNC] [SLNC] [ESG]` override control shown
   when detection confidence is low. No such control exists in the
   current implementation — an undetected file is reported via a
   "Could not detect profile" message with no manual picker.
   **Resolution: not implemented; this task's brief explicitly forbids
   adding it during the redesign without separate authorization, so it
   is documented here as a known gap, not silently introduced.**

7. **Unmatched DT correction location.** Current implementation places
   the correction *input* (contractor text field + Update button)
   centrally on the Overview page, aggregated across all groups, while
   `profile-page.js` renders only a read-only Unmatched DT Rows table per
   group. This design freeze's §12 explicitly rejects centralizing
   correction on Overview going forward and mandates a per-Cleaning-Group
   contextual correction workflow. **Resolution: this is a forward-
   looking design decision for UI-5C, not a description of current
   behavior — flagged here so implementers do not mistake §12 for
   already-built behavior.**

No other conflicts were found between `docs/DECISIONS.md`,
`docs/INFRASTRUCTURE_BLUEPRINT.md`, `docs/VALIDATION_CHECKLIST.md`,
`docs/CLEANING_LOGIC_SPEC.md`, `README.md`, and the current `js/` and
`css/` implementation as inspected for this document.
