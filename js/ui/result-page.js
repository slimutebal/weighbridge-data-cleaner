import { renderOverview, resetUnmatchedDtDrafts } from "./overview-page.js";
import { renderProfilePage } from "./profile-page.js";
import { mountActionBar } from "./action-bar.js";
import { rowsToTsv } from "../core/tsv-exporter.js";
import { copyToClipboard } from "./clipboard-utils.js";

const PROFILE_ORDER = ["HYNC", "SLNC", "ESG"];

export function mountResultPage(
  container,
  { decimalSeparator = ".", listDtEndpoint, onRecleanRequested, actionBarContainer } = {}
) {
  let currentDecimalSeparator = decimalSeparator;
  let hasFilesSelected = false;

  const heading = document.createElement("h2");
  heading.textContent = "Cleaning Results";

  const statusSection = document.createElement("div");
  statusSection.className = "result-section";
  const statusHeading = document.createElement("h3");
  statusHeading.textContent = "List DT Status";
  const statusBody = document.createElement("div");
  statusSection.appendChild(statusHeading);
  statusSection.appendChild(statusBody);

  const tabsNav = document.createElement("div");
  tabsNav.className = "result-tabs";

  const panelContainer = document.createElement("div");
  panelContainer.className = "result-section result-tab-panel";

  container.appendChild(heading);
  container.appendChild(statusSection);
  container.appendChild(tabsNav);
  container.appendChild(panelContainer);

  let currentResult = { groups: [], warnings: [], fileErrors: [], listDtInfo: null };
  let activeTab = "overview";

  // The bottom action bar is the primary place operators trigger
  // Refresh/Copy actions (v0.2.0-prepilot revision 4) — re-runs cleaning
  // against whatever files are currently selected, without requiring
  // re-upload, using the current List DT cache and decimal separator.
  const actionBar = mountActionBar(actionBarContainer, {
    onRefresh: () => {
      if (onRecleanRequested) onRecleanRequested();
    },
    onCopyAll: (button) => {
      const allRows = currentResult.groups.flatMap((group) => group.rows);
      const tsv = rowsToTsv(allRows, { includeHeader: false, decimalSeparator: currentDecimalSeparator });
      copyToClipboard(tsv, button);
    },
    onCopyProfile: (button) => {
      if (activeTab === "overview") return;
      const profileRows = currentResult.groups
        .filter((group) => group.profile === activeTab)
        .flatMap((group) => group.rows);
      const tsv = rowsToTsv(profileRows, {
        includeHeader: false,
        decimalSeparator: currentDecimalSeparator,
      });
      copyToClipboard(tsv, button);
    },
  });

  function updateActionBar() {
    actionBar.update({
      hasFiles: hasFilesSelected,
      hasResults: currentResult.groups.length > 0,
      isProfileTab: activeTab !== "overview",
    });
  }

  function renderListDtStatus(listDtInfo) {
    statusBody.innerHTML = "";

    if (!listDtInfo) {
      const placeholder = document.createElement("p");
      placeholder.className = "placeholder-text";
      placeholder.textContent = "List DT status will appear here after cleaning is run.";
      statusBody.appendChild(placeholder);
      return;
    }

    const line = document.createElement("p");
    line.textContent = `Source: ${listDtInfo.source} | Records: ${listDtInfo.recordCount} | Duplicate DT ID conflicts: ${listDtInfo.duplicates.length}`;
    statusBody.appendChild(line);
  }

  function profilesPresent() {
    return PROFILE_ORDER.filter((profileId) =>
      currentResult.groups.some((group) => group.profile === profileId)
    );
  }

  function renderTabs() {
    tabsNav.innerHTML = "";
    const tabs = ["overview", ...profilesPresent()];
    if (!tabs.includes(activeTab)) activeTab = "overview";

    tabs.forEach((tabId) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        tabId === activeTab ? "result-tab-btn result-tab-btn-active" : "result-tab-btn";
      btn.textContent = tabId === "overview" ? "Overview" : tabId;
      btn.addEventListener("click", () => {
        activeTab = tabId;
        renderTabs();
        renderPanel();
        updateActionBar();
      });
      tabsNav.appendChild(btn);
    });
  }

  function renderPanel() {
    if (activeTab === "overview") {
      renderOverview(panelContainer, currentResult, currentDecimalSeparator, {
        listDtEndpoint,
        onRecleanRequested,
      });
    } else {
      const profileGroups = currentResult.groups.filter((group) => group.profile === activeTab);
      renderProfilePage(panelContainer, profileGroups, currentDecimalSeparator);
    }
  }

  function reset() {
    currentResult = { groups: [], warnings: [], fileErrors: [], listDtInfo: null };
    activeTab = "overview";
    hasFilesSelected = false;
    resetUnmatchedDtDrafts();
    renderListDtStatus(null);
    renderTabs();
    renderPanel();
    updateActionBar();
  }

  function showGroups(result) {
    currentResult = {
      groups: result.groups || [],
      warnings: result.warnings || [],
      fileErrors: result.fileErrors || [],
      listDtInfo: result.listDtInfo || null,
    };
    renderListDtStatus(currentResult.listDtInfo);
    renderTabs();
    renderPanel();
    updateActionBar();
  }

  function setDecimalSeparator(value) {
    currentDecimalSeparator = value === "," ? "," : ".";
    renderPanel();
  }

  function setHasFiles(hasFiles) {
    hasFilesSelected = Boolean(hasFiles);
    updateActionBar();
  }

  reset();

  return { reset, showGroups, setDecimalSeparator, setHasFiles };
}
