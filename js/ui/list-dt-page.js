import {
  loadListDt,
  refreshFromEndpointInBackground,
  getPendingSyncEntries,
  removePendingSyncEntries,
  syncDtMappingsToGoogleSheet,
} from "../core/list-dt-manager.js";
import { loadAppConfig } from "../core/app-settings.js";
import { announce } from "./live-announcer.js";
import { t, subscribeLanguage } from "./i18n.js";
import { mountSettingsTrigger } from "./settings-panel.js";

function formatUpdatedAt(updatedAt) {
  if (!updatedAt) return t("listdt.na");
  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime()) ? t("listdt.na") : date.toLocaleString();
}

function translatedSourceLabel(source) {
  if (source === "cache") return t("listdt.source.cache");
  if (source === "bundled") return t("listdt.source.bundled");
  return source;
}

// Compact List DT utility bar (Phase C1) — the single authoritative List DT
// presentation in the app (the former duplicate block inside Cleaning
// Results has been removed from result-page.js). Keeps every List DT
// operational affordance (record count, source/status, last-updated, Update
// List DT, Sync Pending DT, pending count) in one dense row instead of the
// previous full-size section, with Settings anchored to the right.
export function mountListDtPage(container, { onUpdated } = {}) {
  let lastListDt = null;
  let feedbackText = "";
  let feedbackIsError = false;

  const bar = document.createElement("div");
  bar.className = "list-dt-bar";

  const infoCol = document.createElement("div");
  infoCol.className = "list-dt-bar-info";

  const titleEl = document.createElement("span");
  titleEl.className = "list-dt-bar-title";

  const statusEl = document.createElement("span");
  statusEl.className = "list-dt-bar-status";

  infoCol.appendChild(titleEl);
  infoCol.appendChild(statusEl);

  const actionsCol = document.createElement("div");
  actionsCol.className = "list-dt-bar-actions";

  const updateBtn = document.createElement("button");
  updateBtn.type = "button";
  updateBtn.className = "btn-secondary";

  const syncPendingBtn = document.createElement("button");
  syncPendingBtn.type = "button";
  syncPendingBtn.className = "btn-secondary";

  actionsCol.appendChild(updateBtn);
  actionsCol.appendChild(syncPendingBtn);

  const feedbackEl = document.createElement("span");
  feedbackEl.className = "list-dt-bar-feedback";

  const mainRow = document.createElement("div");
  mainRow.className = "list-dt-bar-main";
  mainRow.appendChild(infoCol);
  mainRow.appendChild(actionsCol);

  const settingsCol = document.createElement("div");
  settingsCol.className = "list-dt-bar-settings";
  mountSettingsTrigger(settingsCol);

  bar.appendChild(mainRow);
  bar.appendChild(feedbackEl);
  bar.appendChild(settingsCol);

  container.appendChild(bar);

  function renderTexts() {
    titleEl.textContent = t("listdt.title");

    if (lastListDt) {
      statusEl.textContent = [
        `${t("listdt.source")}: ${translatedSourceLabel(lastListDt.source)}`,
        `${t("listdt.records")}: ${lastListDt.recordCount}`,
        `${t("listdt.duplicates")}: ${lastListDt.duplicates.length}`,
        `${t("listdt.lastUpdated")}: ${formatUpdatedAt(lastListDt.updatedAt)}`,
      ].join(" | ");
    }

    updateBtn.textContent = t("listdt.update");

    const pendingCount = getPendingSyncEntries().length;
    syncPendingBtn.textContent = `${t("listdt.syncPending")} (${pendingCount})`;
    syncPendingBtn.disabled = pendingCount === 0;

    feedbackEl.textContent = feedbackText;
    feedbackEl.className = feedbackIsError
      ? "list-dt-bar-feedback placeholder-text sync-message-warn"
      : "list-dt-bar-feedback placeholder-text";
  }

  async function refreshStatus() {
    lastListDt = await loadListDt();
    renderTexts();
  }

  updateBtn.addEventListener("click", async () => {
    updateBtn.disabled = true;
    feedbackText = t("listdt.updating");
    feedbackIsError = false;
    renderTexts();

    const appConfig = await loadAppConfig();
    const result = await refreshFromEndpointInBackground(appConfig.listDtEndpoint);

    if (result.ok) {
      feedbackText = t("listdt.updateSuccess", { count: result.recordCount });
      feedbackIsError = false;
      announce(t("listdt.updateSuccessAnnounce"));
      await refreshStatus();
      if (onUpdated) await onUpdated();
    } else {
      feedbackText = t("listdt.updateFailed", { reason: result.reason });
      feedbackIsError = true;
      announce(t("listdt.updateFailedAnnounce"));
      renderTexts();
    }

    updateBtn.disabled = false;
  });

  syncPendingBtn.addEventListener("click", async () => {
    const pending = getPendingSyncEntries();
    if (!pending.length) return;

    syncPendingBtn.disabled = true;
    const appConfig = await loadAppConfig();
    const result = await syncDtMappingsToGoogleSheet(appConfig.listDtEndpoint, pending);

    // Mirrors overview-page.js's applyGoogleSyncOutcome(): removes whatever
    // the endpoint confirmed (synced or already-duplicate) from the pending
    // queue regardless of whether the batch as a whole fully succeeded, and
    // never removes anything the endpoint didn't explicitly confirm.
    if (result.perEntry) {
      const resolvedIds = result.perEntry
        .filter((entry) => entry.outcome === "synced" || entry.outcome === "duplicate")
        .map((entry) => entry.dt_id);
      if (resolvedIds.length) removePendingSyncEntries(resolvedIds);
    } else if (result.ok) {
      removePendingSyncEntries(pending.map((entry) => entry.dt_id));
    }

    if (result.ok) {
      const syncedCount = result.perEntry ? result.perEntry.length : pending.length;
      feedbackText = t("listdt.syncPendingSuccess", { count: syncedCount });
      feedbackIsError = false;
      announce(t("listdt.syncedAnnounce"));
    } else {
      feedbackText = t("listdt.syncPendingFailed", { reason: result.reason });
      feedbackIsError = true;
      announce(t("listdt.syncPendingAnnounce"));
    }

    syncPendingBtn.disabled = false;
    renderTexts();
  });

  subscribeLanguage(() => {
    renderTexts();
  });

  refreshStatus();

  return { refreshStatus };
}
