import { renderOverview, resetUnmatchedDtDrafts } from "./overview-page.js";
import { renderProfilePage } from "./profile-page.js";
import { mountActionBar } from "./action-bar.js";
import { rowsToTsv } from "../core/tsv-exporter.js";
import { copyToClipboard } from "./clipboard-utils.js";
import { computeGroupReadiness, summarizeGroupReadiness, READINESS_SHORT_LABEL } from "../core/readiness.js";
import { getGroupKey } from "../core/group-key.js";
import { closeViewAllRowsModal } from "./view-all-modal.js";

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
  // Which cleaning group (by getGroupKey) is expanded within the active
  // profile tab — single-open accordion state (section 9). null means "no
  // group expanded" (valid only for profiles with 2+ groups; a profile
  // with exactly one group always shows it open regardless of this value,
  // see renderProfilePage's own single-group rule).
  let activeGroupKey = null;

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

  // Copy gating (D009-scoped: never about shift, only about unresolved
  // blocking validation issues within the relevant scope). A group blocks
  // its profile's "Copy This Profile" and blocks "Copy All Groups" only
  // while it has blocking issues (Unmatched DT / Other Blocking Issues);
  // Timestamp Window Notes alone never block copying.
  function isGroupBlocked(group) {
    return computeGroupReadiness(group.validation).blocking;
  }

  function updateActionBar() {
    const allBlocked = currentResult.groups.some(isGroupBlocked);
    const profileBlocked =
      activeTab !== "overview" &&
      currentResult.groups
        .filter((group) => group.profile === activeTab)
        .some(isGroupBlocked);

    actionBar.update({
      hasFiles: hasFilesSelected,
      hasResults: currentResult.groups.length > 0,
      isProfileTab: activeTab !== "overview",
      allBlocked,
      profileBlocked,
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

  // Highest-severity status across a profile's groups, for the compact tab
  // badge (section 6) — reuses summarizeGroupReadiness's own priority
  // ordering (FAILED > ACTION_REQUIRED > READY_WITH_INFO > READY), never a
  // separate calculation.
  function profileTabBadgeText(profileId) {
    const groups = currentResult.groups.filter((group) => group.profile === profileId);
    if (!groups.length) return "";
    const summary = summarizeGroupReadiness(groups);
    const groupWord = summary.totalGroups === 1 ? "group" : "groups";
    return `${summary.totalGroups} ${groupWord} · ${READINESS_SHORT_LABEL[summary.highestSeverity].toLowerCase()}`;
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

      const label = document.createElement("span");
      label.className = "result-tab-label";
      label.textContent = tabId === "overview" ? "Overview" : tabId;
      btn.appendChild(label);

      if (tabId !== "overview") {
        const badgeText = profileTabBadgeText(tabId);
        if (badgeText) {
          const badge = document.createElement("span");
          badge.className = "result-tab-badge";
          badge.textContent = badgeText;
          btn.appendChild(badge);
        }
      }

      btn.addEventListener("click", () => {
        if (activeTab === tabId) return;
        // ON PROFILE CHANGE (section 14): close any View All panel and
        // clear the active group from the previous profile before
        // rendering the target profile's own default expansion.
        closeViewAllRowsModal();
        activeGroupKey = null;
        activeTab = tabId;
        renderTabs();
        renderPanel();
        updateActionBar();
      });
      tabsNav.appendChild(btn);
    });
  }

  // Single-open accordion toggle for the active profile tab (section 9):
  // clicking the currently-open group collapses it (no group remains
  // open); clicking a different group closes the previous one and opens
  // the clicked one — implicit, since renderProfilePage only ever renders
  // one group's body per render pass.
  function handleToggleGroup(groupKey) {
    // ON GROUP CHANGE / ON GROUP COLLAPSE (section 14): the previous
    // group's View All panel must never survive into the new state.
    closeViewAllRowsModal();
    activeGroupKey = activeGroupKey === groupKey ? null : groupKey;
    renderPanel();
    updateActionBar();
  }

  function renderPanel() {
    if (activeTab === "overview") {
      renderOverview(panelContainer, currentResult, currentDecimalSeparator, {
        listDtEndpoint,
        onRecleanRequested,
      });
    } else {
      const profileGroups = currentResult.groups.filter((group) => group.profile === activeTab);
      // A stale key (group removed/changed by a re-clean) must never be
      // treated as active — falls back to "all collapsed" for that profile.
      const validKey =
        activeGroupKey && profileGroups.some((group) => getGroupKey(group) === activeGroupKey)
          ? activeGroupKey
          : null;
      renderProfilePage(panelContainer, profileGroups, currentDecimalSeparator, {
        activeGroupKey: validKey,
        onToggleGroup: handleToggleGroup,
      });
    }
  }

  function reset() {
    // ON CLEAR / RESET (section 14).
    closeViewAllRowsModal();
    activeGroupKey = null;
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
    // ON REFRESH CLEANING (section 14): close View All and clear the
    // active group before the rebuilt groups are applied — a previous
    // group's identity may no longer exist, or may now mean something
    // different, once results are recomputed.
    closeViewAllRowsModal();
    activeGroupKey = null;
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
