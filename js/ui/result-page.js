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
  // Tab semantics (Phase B) — set once on this stable, never-recreated
  // container; only the individual tab buttons inside it are rebuilt by
  // renderTabs() below.
  tabsNav.setAttribute("role", "tablist");
  tabsNav.setAttribute("aria-label", "Cleaning result profile tabs");

  const panelContainer = document.createElement("div");
  panelContainer.className = "result-section result-tab-panel";
  // Single shared panel behind every tab (Phase B) — content is swapped,
  // not one hidden panel per tab, so every tab's aria-controls points at
  // this one stable id and aria-labelledby is kept pointed at whichever
  // tab is currently active (updated in renderPanel() below).
  panelContainer.id = "result-tab-panel";
  panelContainer.setAttribute("role", "tabpanel");

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

  function tabElementId(tabId) {
    return `result-tab-${tabId}`;
  }

  // Single tab-activation path (Phase B) — used by both the pointer click
  // handler and the keyboard handler below, so keyboard activation can
  // never diverge into a second, independent tab state. Re-renders the
  // tab bar (fresh aria-selected/tabindex per button) and the panel, then
  // moves DOM focus onto the newly active tab's button — its old button
  // element was just destroyed by renderTabs()'s innerHTML reset, so
  // without this, focus would silently fall back to <body> after every
  // activation (mouse or keyboard).
  function activateTab(tabId) {
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
    const newBtn = tabsNav.querySelector(`#${tabElementId(tabId)}`);
    if (newBtn) newBtn.focus();
  }

  function renderTabs() {
    tabsNav.innerHTML = "";
    const tabs = ["overview", ...profilesPresent()];
    if (!tabs.includes(activeTab)) activeTab = "overview";

    tabs.forEach((tabId) => {
      const isActive = tabId === activeTab;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = tabElementId(tabId);
      btn.className = isActive ? "result-tab-btn result-tab-btn-active" : "result-tab-btn";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(isActive));
      btn.setAttribute("aria-controls", "result-tab-panel");
      // Roving tabindex (Phase B): only the active tab is a normal Tab
      // stop; arrow keys move among the rest (see the tabsNav keydown
      // listener below), per the standard ARIA tabs pattern.
      btn.tabIndex = isActive ? 0 : -1;

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

      btn.addEventListener("click", () => activateTab(tabId));
      tabsNav.appendChild(btn);
    });
  }

  // Arrow/Home/End keyboard navigation (Phase B), delegated on the stable
  // tabsNav container rather than attached per-button, so it keeps working
  // across every renderTabs() rebuild without re-attaching listeners.
  // Enter/Space need no extra handling — these are real <button> elements,
  // so the browser already fires a click (and therefore activateTab) on
  // both keys natively.
  tabsNav.addEventListener("keydown", (event) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    if (!event.target.closest(".result-tab-btn")) return;
    event.preventDefault();

    const tabs = ["overview", ...profilesPresent()];
    const currentIndex = tabs.indexOf(activeTab);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;

    activateTab(tabs[nextIndex]);
  });

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
    // Keeps the single shared panel's accessible name pointed at whichever
    // tab is currently active (Phase B) — cheap to set unconditionally on
    // every render, and panelContainer.innerHTML resets below (inside
    // renderOverview/renderProfilePage) only clear its children, never its
    // own attributes.
    panelContainer.setAttribute("aria-labelledby", tabElementId(activeTab));

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
