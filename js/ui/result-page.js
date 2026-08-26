import { renderProfilePage, renderProfilePagePlaceholder, GROUP_SECTION } from "./profile-page.js";
import { resetDtCorrectionDrafts } from "./dt-correction-panel.js";
import { mountActionBar } from "./action-bar.js";
import { rowsToTsv } from "../core/tsv-exporter.js";
import { copyToClipboard } from "./clipboard-utils.js";
import { READINESS } from "../core/readiness.js";
import { getGroupReadiness, summarizeGroupReadiness } from "./group-readiness.js";
import { startNewRun as startNewWeightExceptionRun } from "../core/weight-exception-store.js";
import { startNewRun as startNewLowNetExceptionRun } from "../core/low-net-weight-store.js";
import { getGroupKey } from "../core/group-key.js";
import { closeViewAllRowsModal } from "./view-all-modal.js";
import { closeWeightExceptionDialog } from "./weight-exception-dialog.js";
import { closeLowNetWeightDialog } from "./low-net-weight-dialog.js";
import { t, subscribeLanguage } from "./i18n.js";
import { READINESS_SHORT_KEY } from "./group-status-presentation.js";

const PROFILE_ORDER = ["HYNC", "SLNC", "ESG"];

export function mountResultPage(
  container,
  {
    decimalSeparator = ".",
    listDtEndpoint,
    onRecleanRequested,
    actionBarContainer,
    // UI-5B navigation correction: the primary HYNC/SLNC/ESG tablist that
    // used to render inside this page now lives in the merged app nav
    // (js/ui/app-nav.js, mounted by main.js). These two callbacks are how
    // this module — the single authority for currentResult/activeTab —
    // keeps that external nav in sync, instead of duplicating either piece
    // of state there.
    onProfilesChanged = () => {},
    onActiveTabChanged = () => {},
  } = {}
) {
  let currentDecimalSeparator = decimalSeparator;
  // Whether Main Page 2 (Results) is the currently visible main page
  // (UI-5A) — defaults false since Input & Overview is the initial page.
  // Used only to gate "Copy This Profile" (§24 of the UI-5A brief: it must
  // never read as an active Page 1 action even though this module's own
  // internal activeTab may still remember a HYNC/SLNC/ESG tab from a
  // previous Results visit). Purely a presentation gate — never affects
  // readiness/copy-eligibility computation itself.
  let isMainPageResultsActive = false;

  const heading = document.createElement("h2");
  heading.textContent = t("results.heading");

  const panelContainer = document.createElement("div");
  panelContainer.className = "result-section result-tab-panel";
  // Single shared panel behind every profile view — content is swapped in
  // place rather than one hidden panel per view. No role="tabpanel" here:
  // profile switching is driven by the merged app nav's plain navigation
  // buttons (js/ui/app-nav.js), not a role="tablist"/role="tab" structure,
  // so a tabpanel role here would be orphaned. aria-label is kept pointed at
  // whichever profile is currently active (updated in renderPanel() below)
  // so it still reads as a properly labelled region.
  panelContainer.id = "result-tab-panel";

  container.appendChild(heading);
  container.appendChild(panelContainer);

  let currentResult = { groups: [], warnings: [], fileErrors: [], listDtInfo: null };
  // null when Results has no profile to show yet (no groups at all — the
  // initial state, or after Clear/Reset). Results has no Overview sub-page
  // (design spec §7/§29, UI-5C §15) — the only two states are "a specific
  // HYNC/SLNC/ESG profile is active" or "nothing to show yet".
  let activeTab = null;
  // Results owns exactly one active Cleaning Group per active profile
  // context (UI-5B §9) — a Map keyed by profileId rather than one flat
  // variable, so switching HYNC -> ESG -> back to HYNC within the same
  // Results visit does not forget which group was selected under HYNC.
  // ensureGroupSelection() (below) is the single place that seeds/repairs
  // an entry, applying the ACTION_REQUIRED > READY_WITH_INFO > first-group
  // default rule (§8/§18) whenever there is no still-valid entry yet.
  let activeGroupKeyByProfile = new Map();
  // Companion map: which of the three group sections (Summary / Validation
  // & Issues / Clean Data) is active per profile (§11/§17/§18). Recomputed
  // alongside the group default whenever the group selection is
  // (re)seeded; preserved as-is on every other re-render so an operator's
  // manual section choice survives group-selector clicks, decimal-format
  // changes, and language changes within the same Results visit.
  let activeSectionByProfile = new Map();

  // The bottom action bar is the primary place operators trigger Copy
  // actions (v0.2.0-prepilot revision 4). Cleaning itself always re-runs
  // internally (a new file selection, a List DT update, or an applied
  // Unmatched DT correction via onRecleanRequested below) — there is no
  // manual "Refresh Cleaning" trigger in the UI (UI-5B §2).
  const actionBar = mountActionBar(actionBarContainer, {
    onCopyAll: (button) => {
      const allRows = currentResult.groups.flatMap((group) => group.rows);
      const tsv = rowsToTsv(allRows, { includeHeader: false, decimalSeparator: currentDecimalSeparator });
      copyToClipboard(tsv, button);
    },
    onCopyProfile: (button) => {
      if (!activeTab) return;
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
    return getGroupReadiness(group).blocking;
  }

  function updateActionBar() {
    const allBlocked = currentResult.groups.some(isGroupBlocked);
    const profileBlocked =
      Boolean(activeTab) &&
      currentResult.groups
        .filter((group) => group.profile === activeTab)
        .some(isGroupBlocked);

    actionBar.update({
      hasResults: currentResult.groups.length > 0,
      isProfileTab: Boolean(activeTab) && isMainPageResultsActive,
      allBlocked,
      profileBlocked,
    });
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
    const groupWord = summary.totalGroups === 1 ? t("results.groupSuffix") : t("results.groupsSuffix");
    const severityLabel = t(READINESS_SHORT_KEY[summary.highestSeverity]).toLowerCase();
    return `${summary.totalGroups} ${groupWord} · ${severityLabel}`;
  }

  // Cleaning Group default-selection rule (design spec §8, UI-5B §8/§18):
  // prefer an ACTION_REQUIRED group, then READY_WITH_INFO, then the first
  // group in the profile's existing (already-grouped/sorted) order. UI
  // selection only — never reorders or recomputes js/core/group-key.js's
  // own grouping.
  function pickDefaultGroupKey(groups) {
    if (!groups.length) return null;
    const actionRequired = groups.find(
      (group) => getGroupReadiness(group).status === READINESS.ACTION_REQUIRED
    );
    if (actionRequired) return getGroupKey(actionRequired);
    const readyWithInfo = groups.find(
      (group) => getGroupReadiness(group).status === READINESS.READY_WITH_INFO
    );
    if (readyWithInfo) return getGroupKey(readyWithInfo);
    return getGroupKey(groups[0]);
  }

  // Default section for a freshly (re)selected group (§17/§18): an
  // ACTION_REQUIRED group opens straight to Validation & Issues; every
  // other status defaults to Summary. Presentation default only — never
  // changes readiness.
  function defaultSectionForGroup(group) {
    return getGroupReadiness(group).status === READINESS.ACTION_REQUIRED
      ? GROUP_SECTION.VALIDATION
      : GROUP_SECTION.SUMMARY;
  }

  // Seeds/repairs the active group (and, only when the group actually
  // changes, its default section) for one profile. A no-op whenever the
  // currently remembered group key is still present among this profile's
  // current groups, so a manual group/section choice is never overridden
  // while it remains valid — §9's "fall back safely without business
  // mutation" applies only to a genuinely stale key (group removed/changed
  // by a re-clean).
  function ensureGroupSelection(profileId, groups) {
    const existingKey = activeGroupKeyByProfile.get(profileId);
    const stillValid = existingKey && groups.some((group) => getGroupKey(group) === existingKey);
    if (stillValid) return;

    const defaultKey = pickDefaultGroupKey(groups);
    activeGroupKeyByProfile.set(profileId, defaultKey);
    const defaultGroup = groups.find((group) => getGroupKey(group) === defaultKey);
    activeSectionByProfile.set(
      profileId,
      defaultGroup ? defaultSectionForGroup(defaultGroup) : GROUP_SECTION.SUMMARY
    );
  }

  // Single tab-activation path — used by the merged app nav's profile
  // buttons (via openProfileTab below).
  function activateTab(tabId) {
    if (activeTab === tabId) return;
    // ON PROFILE CHANGE (section 14): close any View All panel first.
    closeViewAllRowsModal();
    activeTab = tabId;
    if (tabId) {
      const profileGroups = currentResult.groups.filter((group) => group.profile === tabId);
      ensureGroupSelection(tabId, profileGroups);
    }
    syncNavState();
    renderPanel();
    updateActionBar();
  }

  // External entry point for the merged app nav's HYNC/SLNC/ESG buttons
  // (UI-5B navigation correction §4) — switches straight to that profile's
  // tab, preserving whatever group/section was last selected under it
  // (activateTab's own ensureGroupSelection only reseeds a stale/missing
  // selection, never one that's still valid).
  function openProfileTab(profileId) {
    activateTab(profileId);
  }

  // Contextual navigation entry point from Page 1's Cleaning Overview
  // (UI-5A) — opens a specific profile tab and, when the group still
  // exists, selects that exact Cleaning Group (§9: "when opened from Page 1
  // with explicit groupKey, select that exact group if it still exists").
  // Never recomputes readiness or grouping; a stale groupKey falls back
  // safely via ensureGroupSelection's own default rule.
  function openProfileGroup(profileId, groupKey) {
    if (!profileId) return;
    closeViewAllRowsModal();
    const profileGroups = currentResult.groups.filter((group) => group.profile === profileId);
    if (!profileGroups.length) {
      // profileId itself is no longer present in currentResult — e.g. Page 1
      // held a stale reference across a re-clean that dropped this profile.
      // Land on a sensible available profile (mirroring showGroups()'s own
      // fallback) instead of stranding activeTab on a profile the merged app
      // nav won't render a button for (profilesPresent() filtering).
      activateTab(profilesPresent()[0] || null);
      return;
    }
    const targetGroup = groupKey ? profileGroups.find((group) => getGroupKey(group) === groupKey) : null;
    if (targetGroup) {
      activeGroupKeyByProfile.set(profileId, groupKey);
      // An ACTION_REQUIRED contextual entry may default to Validation &
      // Issues (§17) — this is the same defaultSectionForGroup() rule used
      // for every other fresh group selection, not a special case.
      activeSectionByProfile.set(profileId, defaultSectionForGroup(targetGroup));
    } else {
      ensureGroupSelection(profileId, profileGroups);
    }
    activeTab = profileId;
    syncNavState();
    renderPanel();
    updateActionBar();
  }

  // Keeps the merged app nav (mounted separately in main.js) in sync with
  // which profiles currently have cleaning results and which one (if any)
  // is active here — result-page.js's own currentResult/activeTab stay the
  // single authority for both, never duplicated in that nav module (UI-5B
  // navigation correction §2/§5).
  function syncNavState() {
    onProfilesChanged(
      profilesPresent().map((profileId) => ({ id: profileId, badgeText: profileTabBadgeText(profileId) }))
    );
    onActiveTabChanged(activeTab);
  }

  // Cleaning Group Selector (§8): switching the active group within a
  // profile is UI state only — never re-cleans, resets approvals, or
  // touches List DT (§9). Focus is explicitly restored to the newly active
  // selector item, since renderPanel() below rebuilds the whole subtree.
  function handleSelectGroup(groupKey) {
    closeViewAllRowsModal();
    activeGroupKeyByProfile.set(activeTab, groupKey);
    renderPanel();
    const activeItem = panelContainer.querySelector(".group-selector-item-active");
    if (activeItem) activeItem.focus();
  }

  // Summary / Validation & Issues / Clean Data section tabs (§11): switching
  // sections is presentation-only — never changes group selection, business
  // state, or approvals. Focus is explicitly restored to the newly active
  // section tab for the same reason as handleSelectGroup above.
  function handleSelectSection(section) {
    activeSectionByProfile.set(activeTab, section);
    renderPanel();
    const activeSectionTab = panelContainer.querySelector(".group-section-tab-btn-active");
    if (activeSectionTab) activeSectionTab.focus();
  }

  function renderPanel() {
    // Keeps the single shared panel's accessible name pointed at whichever
    // profile currently governs it (its button now lives in the merged app
    // nav, outside this module, so there is no local id to point
    // aria-labelledby at).
    panelContainer.setAttribute("aria-label", activeTab || t("results.heading"));

    if (!activeTab) {
      // No profile to show yet (no groups at all). Results has no Overview
      // sub-page (design spec §7/§29, UI-5C §15) — Page 1's Cleaning
      // Overview is the only summary/navigation surface now.
      panelContainer.innerHTML = "";
      const placeholder = document.createElement("p");
      placeholder.className = "placeholder-text";
      placeholder.textContent = currentResult.fileErrors.length
        ? t("results.noGroupsErrors")
        : t("results.noGroupsEmpty");
      panelContainer.appendChild(placeholder);
      return;
    }

    const profileGroups = currentResult.groups.filter((group) => group.profile === activeTab);
    if (!profileGroups.length) {
      renderProfilePagePlaceholder(panelContainer);
      return;
    }

    // Safety net mirroring the original stale-key guard: repairs the
    // selection if it somehow went stale without going through
    // activateTab/openProfileGroup/handleSelectGroup (e.g. a decimal-format
    // or language re-render calling renderPanel() directly).
    ensureGroupSelection(activeTab, profileGroups);
    const activeGroupKey = activeGroupKeyByProfile.get(activeTab);
    const activeSection = activeSectionByProfile.get(activeTab) || GROUP_SECTION.SUMMARY;

    renderProfilePage(panelContainer, profileGroups, currentDecimalSeparator, {
      activeGroupKey,
      activeSection,
      onSelectGroup: handleSelectGroup,
      onSelectSection: handleSelectSection,
      // A weight-exception approve/revoke changes copy-gating readiness
      // (v1.2.0, §12-13) — re-render the panel (fresh effective validation
      // per group) and refresh the action bar's disabled state.
      onWeightExceptionChanged: () => {
        renderPanel();
        updateActionBar();
      },
      listDtEndpoint,
      // Unmatched DT correction (UI-5C §12) now lives inside the affected
      // Cleaning Group's Validation & Issues section — this wrapper is what
      // lets the correction workflow trigger the existing internal re-clean
      // callback without the operator ever leaving the current group/tab.
      onRecleanRequested: triggerRecleanPreservingContext,
    });
  }

  // Runs the app's existing internal re-clean (main.js's onRecleanRequested,
  // the same path already used after Update List DT), then restores the
  // operator's prior Results context if it is still valid (UI-5C §14): stay
  // on the same profile tab, the same Cleaning Group, and the same
  // Validation & Issues section where practical, rather than falling back
  // to showGroups()'s general "prefer an ACTION_REQUIRED group" default —
  // which could otherwise jump the operator to a *different* group the
  // instant this one's Unmatched DT issue is resolved. If the exact group no
  // longer exists, the safe default already applied by showGroups() (via
  // renderPanel()'s ensureGroupSelection safety net) is left as-is.
  async function triggerRecleanPreservingContext() {
    const preservedProfile = activeTab;
    const preservedGroupKey = preservedProfile ? activeGroupKeyByProfile.get(preservedProfile) : null;
    const preservedSection = preservedProfile ? activeSectionByProfile.get(preservedProfile) : null;

    if (onRecleanRequested) await onRecleanRequested();

    if (!preservedProfile || !profilesPresent().includes(preservedProfile)) return;

    const profileGroups = currentResult.groups.filter((group) => group.profile === preservedProfile);
    const groupStillExists =
      preservedGroupKey && profileGroups.some((group) => getGroupKey(group) === preservedGroupKey);

    activeTab = preservedProfile;
    if (groupStillExists) {
      activeGroupKeyByProfile.set(preservedProfile, preservedGroupKey);
      if (preservedSection) activeSectionByProfile.set(preservedProfile, preservedSection);
    }
    syncNavState();
    renderPanel();
    updateActionBar();

    // Avoid dumping focus onto body after the whole panel was rebuilt
    // (§28) — land it on the newly active section tab, same as every other
    // section-preserving re-render in this module.
    const activeSectionTab = panelContainer.querySelector(".group-section-tab-btn-active");
    if (activeSectionTab) activeSectionTab.focus();
  }

  function reset() {
    // ON CLEAR / RESET (section 14). Also clears every session-scoped
    // approved weight exception (v1.2.0, §10) — an approval must never
    // survive a Clear/Reset.
    closeViewAllRowsModal();
    closeWeightExceptionDialog();
    closeLowNetWeightDialog();
    startNewWeightExceptionRun();
    startNewLowNetExceptionRun();
    activeGroupKeyByProfile = new Map();
    activeSectionByProfile = new Map();
    currentResult = { groups: [], warnings: [], fileErrors: [], listDtInfo: null };
    activeTab = null;
    resetDtCorrectionDrafts();
    syncNavState();
    renderPanel();
    updateActionBar();
  }

  function showGroups(result) {
    // ON A NEW RESULT SET (section 14): close View All and clear every
    // per-profile group/section selection before the rebuilt groups are
    // applied — a previous group's identity may no longer exist, or may
    // now mean something different, once results are recomputed. Also
    // starts a new weight-exception approval run (v1.2.0, §10) — every
    // path that replaces the result set (an internal re-clean, a new
    // upload, a file removal producing a new empty/changed result) must
    // invalidate prior session approvals, since the underlying rows (and
    // their Gross/Tare/Recorded Net) may have changed.
    closeViewAllRowsModal();
    closeWeightExceptionDialog();
    closeLowNetWeightDialog();
    startNewWeightExceptionRun();
    startNewLowNetExceptionRun();
    activeGroupKeyByProfile = new Map();
    activeSectionByProfile = new Map();
    currentResult = {
      groups: result.groups || [],
      warnings: result.warnings || [],
      fileErrors: result.fileErrors || [],
      listDtInfo: result.listDtInfo || null,
    };

    // Result Defaults (§18): retain the current profile tab when it's
    // still present; otherwise land on the first available profile in
    // canonical order (a "sensible available profile"), so a first-ever
    // cleaning run (or a re-clean that dropped the previously active
    // profile) lands the operator on real Results content.
    const tabs = profilesPresent();
    if (!tabs.includes(activeTab)) {
      activeTab = tabs[0] || null;
    }

    syncNavState();
    renderPanel();
    updateActionBar();
  }

  function setDecimalSeparator(value) {
    currentDecimalSeparator = value === "," ? "," : ".";
    renderPanel();
  }

  // Called by main.js whenever Main Page navigation toggles (UI-5A) —
  // presentation state only, never touches currentResult/activeTab/
  // activeGroupKey, so switching back to Results still shows exactly what
  // was last open there.
  function setMainPageActive(isResultsActive) {
    isMainPageResultsActive = Boolean(isResultsActive);
    updateActionBar();
  }

  // Re-renders every persistent piece of this page's own text (heading, nav
  // badge text via syncNavState, panel) from the existing in-memory
  // currentResult on a language change — never re-fetches or re-cleans, and
  // never touches file/List DT/readiness state (Part 4 of the C1 spec).
  subscribeLanguage(() => {
    heading.textContent = t("results.heading");
    syncNavState();
    renderPanel();
  });

  reset();

  return {
    reset,
    showGroups,
    setDecimalSeparator,
    openGroup: openProfileGroup,
    openProfileTab,
    setMainPageActive,
  };
}
