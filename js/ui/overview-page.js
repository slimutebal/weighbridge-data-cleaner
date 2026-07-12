import { formatDecimal } from "../core/output-formatter.js";
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

function renderSummaryTable(container, groups, decimalSeparator) {
  const table = document.createElement("table");
  table.className = "groups-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  [
    "overview.profile",
    "overview.date",
    "overview.bucket",
    "overview.rows",
    "overview.netTonnage",
    "overview.missingContractor",
    "overview.missingSource",
    "overview.missingGrade",
    "overview.timestampWindowNotes",
    "overview.skippedRows",
  ].forEach((key) => {
    const th = document.createElement("th");
    th.textContent = t(key);
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  groups.forEach((group) => {
    const tr = document.createElement("tr");
    [
      group.profile,
      group.date,
      group.bucket,
      String(group.rows.length),
      formatDecimal(group.validation.cleanTonnage, decimalSeparator),
      String(group.validation.missingContractorCount),
      String(group.validation.missingSourceCount),
      String(group.validation.missingGradeCount),
      String(group.validation.shiftWarningCount),
      String(group.skippedRowsCount || 0),
    ].forEach((text) => {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  container.appendChild(table);
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
  wrap.appendChild(table);

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
