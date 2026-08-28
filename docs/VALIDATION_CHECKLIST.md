# Validation Checklist

Expected validation checks computed per Cleaning Group by
`js/core/validation-engine.js` (`computeGroupValidation`), classified into
blocking vs. informational by `js/core/readiness.js`. See
`CLEANING_LOGIC_SPEC.md` §13-14 for the full field-by-field spec.

## Row-level and structural checks

- [ ] Raw row count / clean row count / lost row count reconcile
      (`rawRowCount = cleanRowCount + lostRowCount`).
- [ ] Raw tonnage / clean tonnage / tonnage difference.
- [ ] Duplicate NO.NOTA rows.
- [ ] Missing Contractor / Source / Grade rows.
- [ ] Unmatched DT rows (blocking).
- [ ] Timestamp window informational rows (never blocking).
- [ ] PILE ID / Source conflicts.

## Row-level weight integrity checks (v1.1.0, D010)

For every candidate detail row, `js/core/weight-integrity.js` checks
`Gross - Tare == Recorded Net` (within the profile's configured
tolerance) at raw source precision, before any tonnage conversion:

- [ ] `WEIGHT_CALCULATION_MISMATCH` — Gross, Tare, Recorded Net all
      parseable; `abs(Calculated Net - Recorded Net)` exceeds tolerance.
      Blocking.
- [ ] `INVALID_GROSS_WEIGHT` — Gross missing/non-numeric. Blocking, and
      never also reported as a calculation mismatch for the same row.
- [ ] `INVALID_TARE_WEIGHT` — Tare missing/non-numeric. Blocking.
- [ ] `INVALID_RECORDED_NET_WEIGHT` — Recorded Net missing/non-numeric.
      Blocking.
- [ ] `NEGATIVE_WEIGHT_VALUE` — any parsed weight is negative. Blocking.
- [ ] `GROSS_BELOW_TARE` — Gross lower than Tare. Blocking.
- [ ] A row can carry at most one weight issue (most-specific-wins); a
      mathematically valid zero is never auto-flagged as invalid.
- [ ] A weight issue never removes the row from Clean Data Preview and
      never counts it as a lost row.
- [ ] Recorded Net, Gross, and Tare are never rewritten by the
      calculated value — confirmed by re-running cleaning after a
      mismatch and observing the clean output/TSV is unchanged for
      that row.
- [ ] Correcting the source file's weight and re-running cleaning
      restores the row to valid (issue disappears, group readiness
      restored) without any code/config change.

## Readiness / copy gating

- [ ] Any blocking issue (including weight integrity) drives group
      readiness to `ACTION_REQUIRED` via `computeGroupReadiness`.
- [ ] Copy This Profile / Copy All Groups are disabled whenever any
      group in scope is `ACTION_REQUIRED`, via the existing centralized
      gating in `js/core/readiness.js` — no per-feature ad-hoc gating.
- [ ] Refresh Cleaning remains enabled regardless of blocking issues.

## Weight exception resolution checks (v1.2.0, D011)

Row-level resolution of `WEIGHT_CALCULATION_MISMATCH` rows via
`js/core/weight-exception-store.js` / `js/ui/weight-exception-dialog.js`.
No other weight issue type has a resolution workflow.

- [ ] All weight-integrity issue rows for one Cleaning Group render
      inside exactly one panel and one table, regardless of how many
      mismatches exist (one mismatch and three mismatches both produce
      exactly one panel/one table — only the row count differs).
- [ ] Unmatched DT Rows remains its own separate panel, never merged
      with Weight Integrity Issues (different resolution workflows).
- [ ] Each unresolved `WEIGHT_CALCULATION_MISMATCH` row offers a
      row-scoped "Konfirmasi Tim Timbangan" action — never a group-wide,
      profile-wide, "Approve All", or "Override All" control.
- [ ] The confirmation dialog requires "Confirmed by" and
      "Reference / reason" (both non-empty) before the confirm action is
      enabled; "Additional notes" stays optional.
- [ ] Choosing "File sumber akan diperbaiki" creates no exception — the
      row stays unresolved and copy stays blocked.
- [ ] Choosing "Tim timbangan mengonfirmasi Net raw dapat digunakan"
      creates an approved exception, preserves Recorded Net unchanged,
      and does not delete the row's mismatch evidence from the table.
- [ ] Approving one row out of several decreases the unresolved count by
      exactly one; the remaining unresolved rows still block copy.
- [ ] Approving every mismatch row in a group brings
      `unresolvedWeightMismatchCount` to 0 and restores copy eligibility
      *only if no other blocking issue exists* (e.g. Unmatched DT Rows
      still blocks even when every weight mismatch is approved).
- [ ] Revoking an approval ("Batalkan Konfirmasi") deletes only the
      approval record, returns the row to unresolved, and restores
      blocking copy-gating immediately.
- [ ] Approvals are scoped to the current in-memory result run: Refresh
      Cleaning and Clear/Reset both start a fresh run with zero
      approvals (`startNewRun()`), independent of whether the recomputed
      mismatches happen to have the same sourceRowId as before.
- [ ] An approval keyed to a specific Gross/Tare/Recorded Net does not
      apply to a row whose Gross, Tare, or Recorded Net has changed
      (e.g. a corrected re-upload) — that row is revalidated as
      unresolved, not silently inherited as approved.
- [ ] Recorded Net, Gross, and Tare are never mutated by approval or
      revocation — only the row's operational resolution status changes.
- [ ] TSV output is unaffected by approvals: official schema/column
      order unchanged, Recorded Net is what's copied, and Gross, Tare,
      Calculated Net, Difference, and every approval field
      (confirmedBy/confirmationReference/notes/confirmedAt/status) never
      appear in the TSV.
- [ ] Validation Report shows Total / Unresolved / Approved weight
      mismatch counts as distinct metrics — an approved exception is
      never folded into "0 mismatches" for the total.

## Scroll-shadow fix checks (v1.2.0 §16-17)

- [ ] The right scroll shadow is visible at the scroll start (when
      overflow exists) and hidden at the scroll end; the left shadow is
      the inverse.
- [ ] Both shadows stay visually fixed to the table viewport edges while
      the table's columns scroll underneath — they must never move with
      scrolled content (this was the pre-fix defect).
- [ ] Scroll shadows never intercept clicks/keyboard focus on table
      content, including the Confirm/Revoke buttons in the Weight
      Integrity Issues table and the Unmatched DT Rows table, which both
      use the same shared `attachScrollEdgeIndicators()` helper.

## Non-regression (v1.2.0)

- [ ] Gross - Tare validation arithmetic, tolerance configuration, and
      issue classification (D010) are unchanged.
- [ ] Bucket-authoritative shift grouping and output "Shift" are
      unchanged; weight exceptions never create or split shift groups.
- [ ] Lost-row reconciliation is unchanged; mismatch/approved rows remain
      clean rows, never lost rows.
- [ ] Output schema, TSV column order, and List DT matching are
      unchanged.

## Low Net Weight Confirmation checks (v1.3.0, D012)

For every candidate detail row, `js/core/net-weight-validation.js`
checks the RECORDED source Net (never Calculated Net) against a
configured minimum threshold (`config/app-config.json`
`minimumNetWeight.<PROFILE>.thresholdTonnes`, 20.00 tonnes for all three
profiles), reusing the row's already-parsed weight-integrity
`recordedNetMinorUnits`:

- [ ] `LOW_NET_WEIGHT` — Recorded Net parseable and non-negative (no
      suppressing weight-integrity issue), strictly below the
      threshold. Blocking.
- [ ] Recorded Net exactly at the threshold passes (no issue); above the
      threshold passes.
- [ ] A row whose Gross/Tare/Recorded Net is already invalid, negative,
      or Gross-below-Tare (D010) is never additionally flagged
      `LOW_NET_WEIGHT` for the same root cause. A
      `WEIGHT_CALCULATION_MISMATCH` row's Recorded Net is still
      independently evaluated (its own row can carry both issues).
- [ ] A low-net row never removes the row from Clean Data Preview, never
      counts it as a lost row, and never creates/splits a shift group.
- [ ] Recorded Net is never rewritten — confirmed by re-running cleaning
      after a low-net finding and observing the clean output/TSV is
      unchanged for that row.
- [ ] Resolution is per-row only (no "Approve All"), via
      `js/core/low-net-weight-store.js` / `js/ui/low-net-weight-dialog.js`
      — the same operational model as D011's weight exceptions, kept as
      an independent store/session run.
- [ ] All low-net issue rows for one Cleaning Group render inside
      exactly one panel and one table, positioned after Weight Integrity
      Issues and before Other Blocking Issues — never merged with any
      other panel, never one panel per row.
- [ ] Approving a row preserves Recorded Net, does not delete the row's
      finding from the table, and decreases the unresolved count by
      exactly one; approving every low-net row in a group restores copy
      eligibility only if no other blocking issue exists.
- [ ] Revoking an approval ("Revoke Confirmation" / "Batalkan
      Konfirmasi") restores blocking readiness immediately.
- [ ] Approvals are scoped to the current in-memory result run: Refresh
      Cleaning and Clear/Reset both start a fresh run with zero
      approvals, and an approval keyed to a specific Recorded Net does
      not apply to a row whose Recorded Net has changed.
- [ ] Validation Report shows Net < 20 Ton total / Unconfirmed / Approved
      Exceptions as distinct metrics.
- [ ] TSV output is unaffected: approved 12-column schema unchanged,
      Recorded Net is what's copied, and no threshold/status/confirmation
      field (thresholdTonnes, confirmedBy, confirmationReference, notes,
      confirmedAt, issue code) ever appears in the TSV.

## Live List DT validation safety procedure (UI-6B)

The `listDtEndpoint` in `config/app-config.json` is a Google Apps Script
in front of the **production/master** List DT Google Sheet — the same
contractor master data real cleaning runs match DT numbers against. It is
not a staging or test endpoint. UI-6A's own validation left three
synthetic mappings (`SCM-CLN 401/402/403`, fake contractor names) on this
live sheet, where they stayed until found and removed at the start of
UI-6B — a real incident, not a hypothetical one.

Rules for every future round of DT-correction / List DT validation or
demo work, manual or agent-assisted:

- [ ] Before any DT-correction testing, read the live endpoint (a plain
      GET is safe) and confirm no leftover synthetic/demo mapping is
      present. Do this again immediately after, not just before.
- [ ] Never `POST` a fake, fabricated, or "realistic-looking" DT/contractor
      pair to the live endpoint — not even temporarily, not even ones that
      look obviously fake to a human reviewer (the sheet doesn't know
      that).
- [ ] While exercising DT-correction UI flows for testing, either block
      network requests to `script.google.com` / `*.googleusercontent.com`
      at the browser/proxy level, or simply never click **Update List
      DT** / **Sync Pending DT** / **Save Mapping & Re-clean**'s sync step
      — local-only correction (`upsertLocalDtMappings`) is enough to
      exercise the UI and never leaves the browser.
- [ ] If a real, non-synthetic correction genuinely needs to go live
      (an actual new contractor/DT pairing), that's fine — it's what the
      feature is for — but it's a deliberate, authorized, one-off action,
      not something to do incidentally while validating something else.
- [ ] After any permitted write to the live endpoint for any reason,
      re-read it (GET) and confirm the sheet now contains exactly what
      was intended — nothing extra, nothing malformed.

## UI-6B — Final polish, cleanup, and release readiness

- [x] Dock/blocking-panel overlap (UI-6A cosmetic finding) fixed: the
      fixed bottom dock could cover the first interactive row(s) of an
      auto-expanded blocking panel (Unmatched DT / Weight Integrity / Net
      Below Threshold / Other Blocking Issues — all `.blocking-issues-details`)
      on first paint at laptop resolutions, before the operator scrolled.
      Root cause: the dock is `position: fixed` at the viewport bottom and
      always visually covers whatever page content naturally falls in its
      band; nothing previously nudged a freshly auto-expanded panel clear
      of that band on first render. Fix: `.blocking-issues-details >
      summary` and `.blocking-issues-body tbody tr:first-child` carry
      `scroll-margin-bottom: calc(var(--bottom-action-bar-height) + 20px)`
      (`css/app.css`), and `renderSelectedGroup` (`js/ui/profile-page.js`)
      calls `scrollIntoView({block: "nearest"})` on the panel's first data
      row (or its summary, if the panel has no table) once rendered — a
      no-op when already visible, so it never fights normal scrolling or a
      re-render after a DT-correction Save. Verified with a real
      unmatched-DT-heavy HYNC run at 1366x768 Light/Dark, 1600x900 Light,
      and 1920x1080 Light: first row clear of the dock on first paint in
      every configuration, end-of-page and Save Mapping reachability
      unaffected.
- [x] Two pre-existing confirmation dialogs (`js/ui/weight-exception-dialog.js`,
      `js/ui/low-net-weight-dialog.js`) opened with their primary action
      button fully unlabeled (disabled, but with no text at all) until the
      operator picked a decision radio, because nothing called
      `updatePrimaryButton()` on initial render. Fixed by calling it once
      immediately after the button/handlers are wired, so the disabled
      button always shows its pending action label.
- [x] Automated baseline: 61/61 tests PASS (7 lost-row reconciliation, 19
      weight integrity, 10 weight exception resolution, 18 low net weight,
      7 DT correction).
- [x] Real-source parity (exact, re-verified after the UI-6B fixes above):
      HYNC 337 rows / 14,421.19 t; SLNC 109 rows / 4,776.33 t; ESG 224
      rows / 10,547.46 t.
- [x] Declared Bucket remains the final Shift authority (D009); contextual
      DT correction (per Cleaning Group, inside Validation & Issues)
      remains the only operational unmatched-DT workflow — neither changed
      in UI-6B.
