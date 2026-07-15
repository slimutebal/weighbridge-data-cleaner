import { formatDecimal } from "../core/output-formatter.js";
import { getEffectiveValidation, getGroupReadiness } from "./group-readiness.js";
import {
  getPendingSyncEntries,
  addPendingSyncEntries,
  removePendingSyncEntries,
  classifyDtCorrections,
  upsertLocalDtMappings,
  syncDtMappingsToGoogleSheet,
} from "../core/list-dt-manager.js";
import { announce } from "./live-announcer.js";
import { t } from "./i18n.js";
import { attachScrollEdgeIndicators } from "./scroll-edge-indicators.js";
import { TABLE_HEADER_NUMERIC_CLASS, TABLE_CELL_NUMERIC_CLASS } from "./table-utils.js";

// Scroll-edge-indicator cleanup handle (Phase C2/incremental) —
// renderUnmatchedDtCorrection() owns its own, since it is also re-invoked
// recursively on its own (Update/Sync button clicks) without going back
// through renderOverview(). The Overview groups-table itself no longer
// attaches a scroll-edge indicator: it is now a compact, fixed-layout
// table (+ narrow-width card fallback) that is never meant to scroll
// horizontally, so there is nothing for an edge indicator to show.
let unmatchedDtScrollCleanup = null;

// Draft contractor inputs and per-DT-ID status (last local/Google sync
// outcome) are kept at module scope (not inside renderOverview) because the
// Overview panel is rebuilt from scratch on every re-render (new cleaning
// run, decimal format change, tab switch back) — without this they'd be
// wiped before the user gets to see them or click Update.
const draftContractorInputs = new Map();
const dtCorrectionStatus = new Map();
let lastSyncMessage = null;

export function resetUnmatchedDtDrafts() {
  draftContractorInputs.clear();
  dtCorrectionStatus.clear();
  lastSyncMessage = null;
}

// Applies a syncDtMappingsToGoogleSheet() result to the pending queue and
// per-DT-ID status display. Handles both the bucketed appendListDt response
// (perEntry outcomes: synced / duplicate / conflict / error / unknown) and
// the older plain ok/fail shape.
function applyGoogleSyncOutcome(syncResult, applied) {
  if (syncResult.perEntry) {
    const resolvedIds = [];
    let allResolved = syncResult.perEntry.length > 0;
    syncResult.perEntry.forEach(({ dt_id, outcome }) => {
      if (outcome === "synced") {
        resolvedIds.push(dt_id);
        dtCorrectionStatus.set(dt_id, { kind: "ok", text: t("overview.syncedOk") });
      } else if (outcome === "duplicate") {
        resolvedIds.push(dt_id);
        dtCorrectionStatus.set(dt_id, { kind: "duplicate", text: t("overview.syncedDuplicate") });
      } else if (outcome === "conflict") {
        allResolved = false;
        dtCorrectionStatus.set(dt_id, {
          kind: "conflict",
          text: t("overview.syncedConflict"),
        });
      } else {
        allResolved = false;
        dtCorrectionStatus.set(dt_id, {
          kind: "error",
          text: t("overview.syncedPendingLocal"),
        });
      }
    });
    if (resolvedIds.length) removePendingSyncEntries(resolvedIds);
    announce(allResolved ? t("listdt.syncedAnnounce") : t("listdt.syncPendingAnnounce"));
    return;
  }

  if (syncResult.ok) {
    removePendingSyncEntries(applied.map((entry) => entry.dt_id));
    applied.forEach((entry) =>
      dtCorrectionStatus.set(entry.dt_id, { kind: "ok", text: t("overview.syncedOk") })
    );
    announce(t("listdt.syncedAnnounce"));
  } else {
    applied.forEach((entry) =>
      dtCorrectionStatus.set(entry.dt_id, {
        kind: "error",
        text: t("overview.syncedPendingLocalReason", { reason: syncResult.reason }),
      })
    );
    announce(t("listdt.syncPendingAnnounce"));
  }
}

function renderMessageList(container, items, className) {
  const list = document.createElement("ul");
  list.className = className;
  items.forEach(({ message }) => {
    const li = document.createElement("li");
    li.textContent = message;
    list.appendChild(li);
  });
  container.appendChild(list);
}

// Combines Missing Contractor/Source/Grade + Weight Integrity Issues (v1.1.0,
// D010 — a concise issue count only, never every affected row, §13) into
// one compact cell/field. `full` reuses the exact same translated field
// labels already shown in the detailed Validation Report
// (overview.missingContractor/Source/Grade, validation.weightMismatch's
// combined overview.weightIntegrityIssues) — never a new phrase — so the
// compact abbreviation and the detailed report always describe the same
// counts the same way.
function buildMissingSummary(missingContractor, missingSource, missingGrade, weightIntegrityIssues) {
  const compact = t("overview.missingCompact", {
    c: missingContractor,
    s: missingSource,
    g: missingGrade,
    w: weightIntegrityIssues,
  });
  const full =
    `${t("overview.missingContractor")}: ${missingContractor}. ` +
    `${t("overview.missingSource")}: ${missingSource}. ` +
    `${t("overview.missingGrade")}: ${missingGrade}. ` +
    `${t("overview.weightIntegrityIssues")}: ${weightIntegrityIssues}.`;
  return { compact, full };
}

// Combines Timestamp Window Notes + Skipped Rows into one compact
// informational cell/field — neither value is a blocker, matching their
// existing informational (never blocking) classification elsewhere.
function buildInformationSummary(timestampNotes, skippedRows) {
  const compact = t("overview.informationCompact", { time: timestampNotes, skip: skippedRows });
  const full =
    `${t("overview.timestampWindowNotes")}: ${timestampNotes}. ` +
    `${t("overview.skippedRows")}: ${skippedRows}.`;
  return { compact, full };
}

// Copy Status pill — icon + visible text, never color-only. `blocked`
// must always come from the existing computeGroupReadiness().blocking
// boolean (the exact same field result-page.js uses to gate Copy actions
// and profile-page.js uses for the Cleaning Status/readiness chip), never
// a value re-derived from Overview's own displayed counts.
function createCopyStatusPill(blocked) {
  const statusText = blocked ? t("overview.copyStatusBlocked") : t("overview.copyStatusReady");

  const pill = document.createElement("span");
  pill.className = blocked ? "copy-status-pill copy-status-blocked" : "copy-status-pill copy-status-ready";
  pill.setAttribute("aria-label", statusText);

  const icon = document.createElement("span");
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = blocked ? "✕" : "✓";
  pill.appendChild(icon);

  const label = document.createElement("span");
  label.textContent = statusText;
  pill.appendChild(label);

  return pill;
}

// Single derivation pass per group, shared by both the desktop table and
// the narrow-width card fallback below, so the two presentations can never
// disagree — every value here is read from the already-computed
// group.validation / group.rows / group.skippedRowsCount, or from
// getGroupReadiness(group) (the app's one readiness/copy-gating decision
// point, approval-aware as of v1.2.0 via js/ui/group-readiness.js).
// Nothing is recalculated.
function computeGroupOverviewData(group, decimalSeparator) {
  const readiness = getGroupReadiness(group);
  // Effective (approval-adjusted) weight-integrity count — an approved
  // exception is not blocking, so the compact "concise issue count" here
  // must agree with the Copy Status pill below, not the raw mathematical
  // total (which stays visible in the detailed Validation Report instead).
  const effectiveValidation = getEffectiveValidation(group);
  return {
    profile: group.profile,
    date: group.date,
    bucket: group.bucket,
    rows: group.rows.length,
    netTonnage: formatDecimal(group.validation.cleanTonnage, decimalSeparator),
    missing: buildMissingSummary(
      group.validation.missingContractorCount,
      group.validation.missingSourceCount,
      group.validation.missingGradeCount,
      effectiveValidation.weightIntegrityIssueCount || 0
    ),
    information: buildInformationSummary(group.validation.shiftWarningCount, group.skippedRowsCount || 0),
    blocked: readiness.blocking,
  };
}

// Compact desktop Overview table (Phase C2 incremental): 8 columns —
// Profile / Date / Bucket / Rows / Net Tonnage / Missing / Information /
// Copy Status — fixed layout with explicit column-width classes (via
// <colgroup>) so it fits without horizontal scrolling at the PC-first
// widths this app targets (Part 4). No scroll-edge indicator is attached
// here (Part 5) — unlike the other C2 tables, this one is designed to
// never need horizontal scrolling in the first place.
function renderOverviewTable(container, groups, decimalSeparator) {
  const wrap = document.createElement("div");
  wrap.className = "summary-table-wrap overview-table-view";

  const table = document.createElement("table");
  table.className = "groups-table";

  const colgroup = document.createElement("colgroup");
  ["profile", "date", "bucket", "rows", "tonnage", "missing", "information", "copy"].forEach((name) => {
    const col = document.createElement("col");
    col.className = `overview-col-${name}`;
    colgroup.appendChild(col);
  });
  table.appendChild(colgroup);

  // Profile/Date/Bucket/Missing/Information/Copy Status are text/compound
  // columns; Rows and Net Tonnage are numeric (Part 3: semantic hooks by
  // column identity, never nth-child).
  const columns = [
    { key: "overview.profile", numeric: false },
    { key: "overview.date", numeric: false },
    { key: "overview.bucket", numeric: false },
    { key: "overview.rows", numeric: true },
    { key: "overview.netTonnage", numeric: true },
    { key: "overview.missing", numeric: false },
    { key: "overview.information", numeric: false },
    { key: "overview.copyStatus", numeric: false },
  ];

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach(({ key, numeric }) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = t(key);
    if (numeric) th.classList.add(TABLE_HEADER_NUMERIC_CLASS);
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  groups.forEach((group) => {
    const data = computeGroupOverviewData(group, decimalSeparator);
    const tr = document.createElement("tr");

    const profileTd = document.createElement("td");
    profileTd.textContent = data.profile;
    tr.appendChild(profileTd);

    const dateTd = document.createElement("td");
    dateTd.textContent = data.date;
    tr.appendChild(dateTd);

    const bucketTd = document.createElement("td");
    bucketTd.textContent = data.bucket;
    tr.appendChild(bucketTd);

    const rowsTd = document.createElement("td");
    rowsTd.textContent = String(data.rows);
    rowsTd.classList.add(TABLE_CELL_NUMERIC_CLASS);
    tr.appendChild(rowsTd);

    const tonnageTd = document.createElement("td");
    tonnageTd.textContent = data.netTonnage;
    tonnageTd.classList.add(TABLE_CELL_NUMERIC_CLASS);
    tr.appendChild(tonnageTd);

    const missingTd = document.createElement("td");
    missingTd.textContent = data.missing.compact;
    missingTd.title = data.missing.full;
    missingTd.setAttribute("aria-label", data.missing.full);
    tr.appendChild(missingTd);

    const infoTd = document.createElement("td");
    infoTd.textContent = data.information.compact;
    infoTd.title = data.information.full;
    infoTd.setAttribute("aria-label", data.information.full);
    tr.appendChild(infoTd);

    const copyTd = document.createElement("td");
    copyTd.appendChild(createCopyStatusPill(data.blocked));
    tr.appendChild(copyTd);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  wrap.appendChild(table);
  container.appendChild(wrap);
}

function createCardField(labelKey, valueText) {
  const field = document.createElement("div");
  field.className = "overview-card-field";

  const label = document.createElement("span");
  label.className = "overview-card-label";
  label.textContent = `${t(labelKey)}: `;

  const value = document.createElement("span");
  value.textContent = valueText;

  field.appendChild(label);
  field.appendChild(value);
  return field;
}

// Narrow-width stacked-card fallback (Phase C2 incremental, Part 6) —
// same computeGroupOverviewData() derivation as the table above (never a
// second calculation), rendered as label/value blocks instead of table
// cells. Toggled purely via CSS (see .overview-table-view /
// .overview-card-view in css/app.css) so no resize listener/JS breakpoint
// logic is needed; both views always exist in the DOM, and the hidden one
// is correctly excluded from the accessibility tree by display: none.
function renderOverviewCards(container, groups, decimalSeparator) {
  const list = document.createElement("div");
  list.className = "overview-card-view";

  groups.forEach((group) => {
    const data = computeGroupOverviewData(group, decimalSeparator);
    const card = document.createElement("div");
    card.className = "overview-card";

    const title = document.createElement("div");
    title.className = "overview-card-title";
    title.textContent = `${data.profile} · ${data.bucket} · ${data.date}`;
    card.appendChild(title);

    const statsRow = document.createElement("div");
    statsRow.className = "overview-card-row";
    statsRow.appendChild(createCardField("overview.rows", String(data.rows)));
    statsRow.appendChild(createCardField("overview.netTonnage", data.netTonnage));
    card.appendChild(statsRow);

    const missingBlock = document.createElement("div");
    missingBlock.className = "overview-card-block";
    const missingLabel = document.createElement("div");
    missingLabel.className = "overview-card-label";
    missingLabel.textContent = `${t("overview.missing")}:`;
    const missingValue = document.createElement("div");
    missingValue.textContent = data.missing.compact;
    missingValue.title = data.missing.full;
    missingValue.setAttribute("aria-label", data.missing.full);
    missingBlock.appendChild(missingLabel);
    missingBlock.appendChild(missingValue);
    card.appendChild(missingBlock);

    const infoBlock = document.createElement("div");
    infoBlock.className = "overview-card-block";
    const infoLabel = document.createElement("div");
    infoLabel.className = "overview-card-label";
    infoLabel.textContent = `${t("overview.information")}:`;
    const infoValue = document.createElement("div");
    infoValue.textContent = data.information.compact;
    infoValue.title = data.information.full;
    infoValue.setAttribute("aria-label", data.information.full);
    infoBlock.appendChild(infoLabel);
    infoBlock.appendChild(infoValue);
    card.appendChild(infoBlock);

    const statusRow = document.createElement("div");
    statusRow.className = "overview-card-status";
    statusRow.appendChild(createCopyStatusPill(data.blocked));
    card.appendChild(statusRow);

    list.appendChild(card);
  });

  container.appendChild(list);
}

function renderSummaryTable(container, groups, decimalSeparator) {
  renderOverviewTable(container, groups, decimalSeparator);
  renderOverviewCards(container, groups, decimalSeparator);
}

function collectUniqueUnmatchedDt(groups) {
  const map = new Map();
  groups.forEach((group) => {
    group.rows.forEach((row) => {
      if (row.Contractor !== "Unmatched") return;
      const dtId = row["NO. DT"];
      if (!dtId) return;
      if (!map.has(dtId)) {
        map.set(dtId, { dtId, rawDtId: row._rawDtId ?? dtId, occurrences: 0 });
      }
      map.get(dtId).occurrences += 1;
    });
  });
  return Array.from(map.values()).sort((a, b) => b.occurrences - a.occurrences);
}

// Renders into `sectionContainer` (a dedicated wrapper owned by this
// section only) and is safe to call repeatedly to redraw just this section
// in place — callers must never call this against the whole Overview
// container, or each redraw would append a duplicate copy alongside the old
// one instead of replacing it.
function renderUnmatchedDtCorrection(sectionContainer, groups, { listDtEndpoint, onRecleanRequested }) {
  if (unmatchedDtScrollCleanup) {
    unmatchedDtScrollCleanup();
    unmatchedDtScrollCleanup = null;
  }
  sectionContainer.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "summary-table-wrap";

  const heading = document.createElement("h3");
  heading.textContent = t("overview.unmatchedDtCorrection");
  wrap.appendChild(heading);

  const uniqueUnmatched = collectUniqueUnmatchedDt(groups);

  if (lastSyncMessage) {
    const msg = document.createElement("p");
    msg.className = lastSyncMessage.ok ? "placeholder-text" : "placeholder-text sync-message-warn";
    msg.textContent = lastSyncMessage.text;
    wrap.appendChild(msg);
  }

  const pendingCount = getPendingSyncEntries().length;
  const pendingRow = document.createElement("div");
  pendingRow.className = "pending-sync-row";

  const pendingLabel = document.createElement("span");
  pendingLabel.className = "placeholder-text";
  pendingLabel.textContent = t("listdt.pendingSync", { count: pendingCount });
  pendingRow.appendChild(pendingLabel);

  const syncPendingBtn = document.createElement("button");
  syncPendingBtn.type = "button";
  syncPendingBtn.className = "btn-secondary";
  syncPendingBtn.textContent = t("listdt.syncPending");
  syncPendingBtn.disabled = pendingCount === 0;
  syncPendingBtn.addEventListener("click", async () => {
    const pending = getPendingSyncEntries();
    if (!pending.length) return;
    syncPendingBtn.disabled = true;
    const result = await syncDtMappingsToGoogleSheet(listDtEndpoint, pending);
    applyGoogleSyncOutcome(result, pending);
    lastSyncMessage = result.ok
      ? { ok: true, text: t("listdt.syncPendingSuccess", { count: pending.length }) }
      : { ok: false, text: t("listdt.syncPendingFailed", { reason: result.reason }) };
    renderUnmatchedDtCorrection(sectionContainer, groups, { listDtEndpoint, onRecleanRequested });
  });
  pendingRow.appendChild(syncPendingBtn);
  wrap.appendChild(pendingRow);

  if (!uniqueUnmatched.length) {
    const empty = document.createElement("p");
    empty.className = "placeholder-text";
    empty.textContent = t("overview.noUnmatched");
    wrap.appendChild(empty);
    sectionContainer.appendChild(wrap);
    return;
  }

  // A table-only inner wrapper (distinct from the outer `wrap`, which also
  // holds the heading/pending-sync row) so horizontal scrolling and its
  // scroll-edge indicators are scoped to exactly the table, matching every
  // other table wrapper in the app (Part 2/6 of the C2 spec). Uses the
  // lighter .table-scroll-wrap (scroll only, no card chrome of its own) —
  // it nests inside the outer .summary-table-wrap, which already supplies
  // the card background/border/padding.
  const tableWrap = document.createElement("div");
  tableWrap.className = "table-scroll-wrap";

  const table = document.createElement("table");
  table.className = "summary-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["overview.unknownDt", "overview.contractorInput", "overview.status"].forEach((key) => {
    const th = document.createElement("th");
    th.textContent = t(key);
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  uniqueUnmatched.forEach(({ dtId, rawDtId, occurrences }) => {
    const tr = document.createElement("tr");

    // Display the standardized master DT id (matches what's written to the
    // local cache / pending queue / Google Sheet payload), not the raw
    // source value — the raw value is still available on hover/title for
    // diagnostics, per "Standardize Unknown DT display".
    const dtCell = document.createElement("td");
    dtCell.textContent = String(dtId);
    if (rawDtId && rawDtId !== dtId) {
      dtCell.title = t("overview.rawSourceValue", { value: rawDtId });
    }
    tr.appendChild(dtCell);

    const inputCell = document.createElement("td");
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = t("overview.contractorPlaceholder");
    input.value = draftContractorInputs.get(dtId) || "";
    input.addEventListener("input", () => {
      draftContractorInputs.set(dtId, input.value);
    });
    inputCell.appendChild(input);
    tr.appendChild(inputCell);

    const statusCell = document.createElement("td");
    const knownStatus = dtCorrectionStatus.get(dtId);
    if (knownStatus) {
      statusCell.textContent = knownStatus.text;
      statusCell.className = `dt-status-${knownStatus.kind}`;
    } else {
      statusCell.textContent = t("overview.unmatchedCount", { count: occurrences });
    }
    tr.appendChild(statusCell);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  wrap.appendChild(tableWrap);
  unmatchedDtScrollCleanup = attachScrollEdgeIndicators(tableWrap);

  const updateBtn = document.createElement("button");
  updateBtn.type = "button";
  updateBtn.className = "btn-secondary";
  updateBtn.textContent = t("overview.updateBtn");
  updateBtn.addEventListener("click", async () => {
    const rawEntries = uniqueUnmatched
      .map(({ dtId }) => ({ dtId, contractor: (draftContractorInputs.get(dtId) || "").trim() }))
      .filter((entry) => entry.contractor);

    if (!rawEntries.length) {
      lastSyncMessage = { ok: false, text: t("overview.enterContractorFirst") };
      renderUnmatchedDtCorrection(sectionContainer, groups, { listDtEndpoint, onRecleanRequested });
      return;
    }

    updateBtn.disabled = true;

    // Local duplicate/conflict guard: classify before writing anything, so
    // an exact repeat (e.g. an accidental double submit) is skipped rather
    // than re-written, and a dt_id already known locally with a *different*
    // contractor is never silently overwritten.
    const classified = await classifyDtCorrections(rawEntries);
    const newEntries = classified.filter((entry) => entry.status === "new");
    const duplicateEntries = classified.filter((entry) => entry.status === "duplicate");
    const conflictEntries = classified.filter((entry) => entry.status === "conflict");

    duplicateEntries.forEach((entry) => {
      dtCorrectionStatus.set(entry.dt_id, {
        kind: "duplicate",
        text: t("overview.alreadyExistsSkipped", { contractor: entry.existingContractor }),
      });
      draftContractorInputs.delete(entry.dt_id);
    });
    conflictEntries.forEach((entry) => {
      dtCorrectionStatus.set(entry.dt_id, {
        kind: "conflict",
        text: t("overview.conflictExisting", { contractor: entry.existingContractor }),
      });
    });

    // Resolve sync (and set lastSyncMessage) before triggering the re-clean
    // below, since re-cleaning repaints this whole section from scratch —
    // setting the message after that repaint would leave it stuck until
    // some later, unrelated re-render.
    let applied = [];
    if (newEntries.length) {
      applied = await upsertLocalDtMappings(
        newEntries.map(({ dt_id, contractor }) => ({ dtId: dt_id, contractor }))
      );
      addPendingSyncEntries(applied);
      applied.forEach((entry) => draftContractorInputs.delete(entry.dt_id));

      const syncResult = await syncDtMappingsToGoogleSheet(listDtEndpoint, applied);
      applyGoogleSyncOutcome(syncResult, applied);
    }

    const summaryParts = [];
    if (applied.length) summaryParts.push(t("overview.summaryNewSaved", { count: applied.length }));
    if (duplicateEntries.length) {
      summaryParts.push(t("overview.summaryAlreadyExisted", { count: duplicateEntries.length }));
    }
    if (conflictEntries.length) {
      summaryParts.push(t("overview.summaryConflicts", { count: conflictEntries.length }));
    }
    lastSyncMessage = {
      ok: conflictEntries.length === 0,
      text: summaryParts.length ? `${summaryParts.join("; ")}.` : t("overview.summaryNoChanges"),
    };

    if (applied.length && onRecleanRequested) {
      await onRecleanRequested();
    } else {
      renderUnmatchedDtCorrection(sectionContainer, groups, { listDtEndpoint, onRecleanRequested });
    }
  });
  wrap.appendChild(updateBtn);

  sectionContainer.appendChild(wrap);
}

export function renderOverview(
  container,
  { groups = [], warnings = [], fileErrors = [] },
  decimalSeparator = ".",
  { listDtEndpoint, onRecleanRequested } = {}
) {
  container.innerHTML = "";

  if (fileErrors.length) {
    renderMessageList(
      container,
      fileErrors.map((e) => ({ message: `${e.fileName}: ${e.message}` })),
      "warning-list warning-list-error"
    );
  }

  const infoNotices = warnings.filter(
    (w) => w.type === "skipped-non-detail" || w.type === "esg-report-groups"
  );
  const realWarnings = warnings.filter(
    (w) => w.type !== "skipped-non-detail" && w.type !== "esg-report-groups"
  );

  if (realWarnings.length) {
    renderMessageList(container, realWarnings, "warning-list");
  }

  if (infoNotices.length) {
    renderMessageList(container, infoNotices, "warning-list warning-list-info");
  }

  if (!groups.length) {
    const placeholder = document.createElement("p");
    placeholder.className = "placeholder-text";
    placeholder.textContent = fileErrors.length
      ? t("results.noGroupsErrors")
      : t("results.noGroupsEmpty");
    container.appendChild(placeholder);

    const emptySectionContainer = document.createElement("div");
    container.appendChild(emptySectionContainer);
    renderUnmatchedDtCorrection(emptySectionContainer, [], { listDtEndpoint, onRecleanRequested });
    return;
  }

  renderSummaryTable(container, groups, decimalSeparator);

  // Copy All Groups now lives in the sticky bottom action bar
  // (v0.2.0-prepilot revision 4), not here — avoids a duplicate button.

  const sectionContainer = document.createElement("div");
  container.appendChild(sectionContainer);
  renderUnmatchedDtCorrection(sectionContainer, groups, { listDtEndpoint, onRecleanRequested });
}
