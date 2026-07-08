import { renderOverview, resetUnmatchedDtDrafts } from "./overview-page.js";
import { renderProfilePage } from "./profile-page.js";

const PROFILE_ORDER = ["HYNC", "SLNC", "ESG"];

export function mountResultPage(
  container,
  { decimalSeparator = ".", listDtEndpoint, onRecleanRequested } = {}
) {
  let currentDecimalSeparator = decimalSeparator;
  let hasFilesSelected = false;

  const heading = document.createElement("h2");
  heading.textContent = "Cleaning Results";

  // Re-runs cleaning against whatever files are currently selected, without
  // requiring re-upload — reuses the same currently-selected files, current
  // List DT cache, and current decimal separator setting. Label reflects
  // whether a cleaning run has already produced results.
  const refreshRow = document.createElement("div");
  refreshRow.className = "refresh-cleaning-row";
  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.addEventListener("click", () => {
    if (onRecleanRequested) onRecleanRequested();
  });
  refreshRow.appendChild(refreshBtn);

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
  container.appendChild(refreshRow);
  container.appendChild(statusSection);
  container.appendChild(tabsNav);
  container.appendChild(panelContainer);

  let currentResult = { groups: [], warnings: [], fileErrors: [], listDtInfo: null };
  let activeTab = "overview";

  function renderRefreshButton() {
    refreshBtn.textContent = currentResult.groups.length ? "Refresh Cleaning" : "Start Cleaning";
    refreshBtn.disabled = !hasFilesSelected;
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
    renderRefreshButton();
    renderListDtStatus(null);
    renderTabs();
    renderPanel();
  }

  function showGroups(result) {
    currentResult = {
      groups: result.groups || [],
      warnings: result.warnings || [],
      fileErrors: result.fileErrors || [],
      listDtInfo: result.listDtInfo || null,
    };
    renderRefreshButton();
    renderListDtStatus(currentResult.listDtInfo);
    renderTabs();
    renderPanel();
  }

  function setDecimalSeparator(value) {
    currentDecimalSeparator = value === "," ? "," : ".";
    renderPanel();
  }

  function setHasFiles(hasFiles) {
    hasFilesSelected = Boolean(hasFiles);
    renderRefreshButton();
  }

  reset();

  return { reset, showGroups, setDecimalSeparator, setHasFiles };
}
