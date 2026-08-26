// Unmatched DT / New Unit contextual correction panel (UI-5C, design spec
// §12/§30 conflict #7). Renders directly inside the affected Cleaning
// Group's Validation & Issues section (js/ui/profile-page.js) — this is now
// the ONE place an operator resolves an unmatched DT, replacing both the
// old read-only "Unmatched DT Rows" table and the centralized,
// all-groups-combined correction section that used to live on the legacy
// Results Overview tab (js/ui/overview-page.js, removed in this phase).
//
// Every List DT behavior below (normalize/match, duplicate detection,
// conflict detection — never silently overwritten, local-first persistence,
// pending sync queue, Google Sheet sync) is reused exactly as-is from
// js/core/list-dt-manager.js; nothing here re-implements or changes that
// logic. The only new logic is presentation: consolidating by unique
// normalized DT id (js/ui/dt-correction-model.js) and triggering the
// existing internal re-clean callback after an applied mapping.
import {
  getPendingSyncEntries,
  addPendingSyncEntries,
  removePendingSyncEntries,
  classifyDtCorrections,
  upsertLocalDtMappings,
  syncDtMappingsToGoogleSheet,
} from "../core/list-dt-manager.js";
import { buildUniqueDtCorrections, compactValueList } from "./dt-correction-model.js";
import { announce } from "./live-announcer.js";
import { t } from "./i18n.js";
import { attachScrollEdgeIndicators } from "./scroll-edge-indicators.js";
import { TABLE_HEADER_NUMERIC_CLASS, TABLE_CELL_NUMERIC_CLASS } from "./table-utils.js";

// Draft contractor inputs and per-DT-id status (last local/Google sync
// outcome) are kept at module scope — this panel is rebuilt from scratch on
// every Cleaning Group re-render (group switch, decimal-format change,
// language change, re-clean), and without this the operator's in-progress
// input or the last save/sync outcome would vanish before they can see it
// or before a pending entry is resolved. Keyed by canonical DT id, so
// harmless stale entries for a DT that has since been resolved (and no
// longer appears in any group's unmatched rows) are simply never rendered.
const draftContractorInputs = new Map();
const dtCorrectionStatus = new Map();
let lastActionMessage = null;
let scrollCleanup = null;

export function resetDtCorrectionDrafts() {
  draftContractorInputs.clear();
  dtCorrectionStatus.clear();
  lastActionMessage = null;
}

function sanitizeForId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "-");
}

// Applies a syncDtMappingsToGoogleSheet() result to the pending-sync queue
// and per-DT-id status display — mirrors the removed overview-page.js's
// applyGoogleSyncOutcome exactly (same bucketed appendListDt outcomes /
// legacy ok-fail shape), including removing only what the endpoint
// explicitly confirmed (synced/duplicate) from the pending queue — never
// assuming success for anything it didn't confirm (phase spec §12).
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
        dtCorrectionStatus.set(dt_id, { kind: "conflict", text: t("overview.syncedConflict") });
      } else {
        allResolved = false;
        dtCorrectionStatus.set(dt_id, { kind: "error", text: t("overview.syncedPendingLocal") });
      }
    });
    if (resolvedIds.length) removePendingSyncEntries(resolvedIds);
    announce(allResolved ? t("listdt.syncedAnnounce") : t("listdt.syncPendingAnnounce"));
    return;
  }

  if (syncResult.ok) {
    removePendingSyncEntries(applied.map((entry) => entry.dt_id));
    announce(t("listdt.syncedAnnounce"));
  } else {
    announce(t("listdt.syncPendingAnnounce"));
  }
}

async function handleSave(uniqueEntries, sectionContainer, group, groupId, opts) {
  const rawEntries = uniqueEntries
    .map(({ dtId }) => ({ dtId, contractor: (draftContractorInputs.get(dtId) || "").trim() }))
    .filter((entry) => entry.contractor);

  if (!rawEntries.length) {
    lastActionMessage = { ok: false, text: t("overview.enterContractorFirst") };
    renderDtCorrectionPanel(sectionContainer, group, groupId, opts);
    return;
  }

  // Local duplicate/conflict guard (reused from list-dt-manager.js, §10-11
  // of the phase spec): classify before writing anything, so an exact
  // repeat is skipped rather than re-written, and a DT id already known
  // locally with a *different* contractor is never silently overwritten.
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

  let applied = [];
  if (newEntries.length) {
    applied = await upsertLocalDtMappings(
      newEntries.map(({ dt_id, contractor }) => ({ dtId: dt_id, contractor }))
    );
    addPendingSyncEntries(applied);
    applied.forEach((entry) => draftContractorInputs.delete(entry.dt_id));

    const syncResult = await syncDtMappingsToGoogleSheet(opts.listDtEndpoint, applied);
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
  lastActionMessage = {
    ok: conflictEntries.length === 0,
    text: summaryParts.length ? `${summaryParts.join("; ")}.` : t("overview.summaryNoChanges"),
  };

  if (applied.length && opts.onRecleanRequested) {
    // A successful mapping always triggers the existing internal re-clean
    // callback (phase spec §9/§13) — the operator never has to leave this
    // Cleaning Group or press a manual refresh. The caller (result-page.js)
    // rebuilds this whole panel fresh as part of that re-render, so there is
    // nothing left to redraw here afterward.
    await opts.onRecleanRequested();
  } else {
    // Duplicate/conflict-only submissions never touched List DT, so no
    // re-clean is warranted — just redraw this panel in place with the
    // updated status text.
    renderDtCorrectionPanel(sectionContainer, group, groupId, opts);
  }
}

// Renders directly into `sectionContainer`, a wrapper owned only by this
// panel — safe to call repeatedly (Save click, Cleaning Group re-render) to
// redraw just this section in place. Renders nothing when there are no
// unmatched rows (issue-driven presentation, §17/§19 — a resolved DT simply
// disappears along with this whole panel once it's no longer unmatched).
export function renderDtCorrectionPanel(sectionContainer, group, groupId, opts = {}) {
  if (scrollCleanup) {
    scrollCleanup();
    scrollCleanup = null;
  }
  sectionContainer.innerHTML = "";

  const rows = group.validation.unmatchedDtRows;
  if (!rows || !rows.length) return;

  const uniqueEntries = buildUniqueDtCorrections(rows);

  const details = document.createElement("details");
  details.className = "blocking-issues-details";
  details.open = true;

  const summary = document.createElement("summary");
  summary.textContent = t("dtCorrection.heading", { count: rows.length });
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "blocking-issues-body";

  const countLine = document.createElement("p");
  countLine.className = "placeholder-text";
  countLine.textContent = t("dtCorrection.summaryCount", { rows: rows.length, unique: uniqueEntries.length });
  body.appendChild(countLine);

  const note = document.createElement("p");
  note.className = "placeholder-text";
  note.textContent = t("dtCorrection.note");
  body.appendChild(note);

  if (lastActionMessage) {
    const msg = document.createElement("p");
    msg.className = lastActionMessage.ok ? "placeholder-text" : "placeholder-text sync-message-warn";
    msg.textContent = lastActionMessage.text;
    body.appendChild(msg);
  }

  const pendingCount = getPendingSyncEntries().length;
  if (pendingCount > 0) {
    const pendingRow = document.createElement("p");
    pendingRow.className = "placeholder-text";
    pendingRow.textContent = t("listdt.pendingSync", { count: pendingCount });
    body.appendChild(pendingRow);
  }

  const tableWrap = document.createElement("div");
  tableWrap.className = "table-scroll-wrap";

  const table = document.createElement("table");
  table.className = "summary-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  [
    { text: "NO. DT", numeric: false },
    { text: t("dtCorrection.rowsColumn"), numeric: true },
    { text: "PILE ID", numeric: false },
    { text: "Source", numeric: false },
    { text: t("dtCorrection.currentColumn"), numeric: false },
    { text: t("overview.contractorInput"), numeric: false },
    { text: t("overview.status"), numeric: false },
  ].forEach(({ text, numeric }) => {
    const th = document.createElement("th");
    th.textContent = text;
    if (numeric) th.classList.add(TABLE_HEADER_NUMERIC_CLASS);
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const moreLabel = (count) => t("dtCorrection.moreCount", { count });

  const tbody = document.createElement("tbody");
  uniqueEntries.forEach((entry) => {
    const tr = document.createElement("tr");

    const dtCell = document.createElement("td");
    dtCell.textContent = entry.dtId;
    const otherRawIds = entry.rawDtIds.filter((raw) => raw !== entry.dtId);
    if (otherRawIds.length) {
      dtCell.title = t("overview.rawSourceValue", { value: otherRawIds.join(", ") });
    }
    tr.appendChild(dtCell);

    const rowsCell = document.createElement("td");
    rowsCell.textContent = String(entry.rows.length);
    rowsCell.classList.add(TABLE_CELL_NUMERIC_CLASS);
    tr.appendChild(rowsCell);

    const pileCompact = compactValueList(entry.pileIds, moreLabel);
    const pileCell = document.createElement("td");
    pileCell.textContent = pileCompact.text;
    if (pileCompact.title) {
      pileCell.title = pileCompact.title;
      pileCell.setAttribute("aria-label", pileCompact.title);
    }
    tr.appendChild(pileCell);

    const sourceCompact = compactValueList(entry.sources, moreLabel);
    const sourceCell = document.createElement("td");
    sourceCell.textContent = sourceCompact.text;
    if (sourceCompact.title) {
      sourceCell.title = sourceCompact.title;
      sourceCell.setAttribute("aria-label", sourceCompact.title);
    }
    tr.appendChild(sourceCell);

    // Every row consolidated here has Contractor === "Unmatched" by
    // construction (validation-engine.js's unmatchedDtRows) — a literal
    // business-data value, never translated (matches Contractor elsewhere).
    const currentCell = document.createElement("td");
    currentCell.textContent = "Unmatched";
    tr.appendChild(currentCell);

    const inputCell = document.createElement("td");
    const inputId = `dt-correction-input-${sanitizeForId(groupId)}-${sanitizeForId(entry.dtId)}`;
    const label = document.createElement("label");
    label.className = "visually-hidden";
    label.htmlFor = inputId;
    label.textContent = t("dtCorrection.contractorLabel", { dtId: entry.dtId });
    const input = document.createElement("input");
    input.type = "text";
    input.id = inputId;
    input.placeholder = t("overview.contractorPlaceholder");
    input.value = draftContractorInputs.get(entry.dtId) || "";
    input.addEventListener("input", () => draftContractorInputs.set(entry.dtId, input.value));
    inputCell.appendChild(label);
    inputCell.appendChild(input);
    tr.appendChild(inputCell);

    const statusCell = document.createElement("td");
    const knownStatus = dtCorrectionStatus.get(entry.dtId);
    if (knownStatus) {
      statusCell.textContent = knownStatus.text;
      statusCell.className = `dt-status-${knownStatus.kind}`;
    } else {
      statusCell.textContent = t("overview.unmatchedCount", { count: entry.rows.length });
    }
    tr.appendChild(statusCell);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  body.appendChild(tableWrap);
  scrollCleanup = attachScrollEdgeIndicators(tableWrap);

  // Progressive disclosure (spec §6): full affected-row evidence per unique
  // DT, collapsed by default so the primary correction table above stays
  // the focus — never one contractor input per source row.
  uniqueEntries.forEach((entry) => {
    const rowDetails = document.createElement("details");
    rowDetails.className = "dt-correction-row-details";

    const rowSummary = document.createElement("summary");
    rowSummary.textContent = t("dtCorrection.viewAffectedRows", { count: entry.rows.length, dtId: entry.dtId });
    rowDetails.appendChild(rowSummary);

    const detailWrap = document.createElement("div");
    detailWrap.className = "table-scroll-wrap";
    const detailTable = document.createElement("table");
    detailTable.className = "summary-table";
    const detailThead = document.createElement("thead");
    detailThead.innerHTML =
      "<tr><th>NO.NOTA</th><th>Raw NO. DT</th><th>Normalized</th><th>PILE ID</th><th>Source</th></tr>";
    detailTable.appendChild(detailThead);
    const detailTbody = document.createElement("tbody");
    entry.rows.forEach((row) => {
      const tr = document.createElement("tr");
      [
        String(row["NO.NOTA"] ?? ""),
        String(row._rawDtId ?? ""),
        String(row["NO. DT"] ?? ""),
        String(row["PILE ID"] ?? ""),
        String(row.Source ?? ""),
      ].forEach((text) => {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      });
      detailTbody.appendChild(tr);
    });
    detailTable.appendChild(detailTbody);
    detailWrap.appendChild(detailTable);
    rowDetails.appendChild(detailWrap);
    body.appendChild(rowDetails);
  });

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn-primary";
  saveBtn.textContent = t("dtCorrection.saveButton");
  saveBtn.addEventListener("click", () => {
    saveBtn.disabled = true;
    handleSave(uniqueEntries, sectionContainer, group, groupId, opts);
  });
  body.appendChild(saveBtn);

  details.appendChild(body);
  sectionContainer.appendChild(details);
}
