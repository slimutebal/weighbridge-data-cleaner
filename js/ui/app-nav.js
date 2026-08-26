// Unified application navigation (UI-5B navigation correction). Merges what
// were two separate controls — the Main Page nav (Input & Overview /
// Results) and Results' own internal HYNC/SLNC/ESG profile tablist — into
// one compact, sticky bar:
//   [ Input & Overview ] [ HYNC ] [ SLNC ] [ ESG ]
// This is a presentation simplification only: there are still exactly two
// conceptual Main Pages (§6). Input & Overview opens Main Page 1; each
// profile button opens Main Page 2 directly at that profile (§3-4). Only
// profiles present in the current cleaning result are rendered (§5),
// mirroring the same profilesPresent() filtering result-page.js already
// used for its own (now-removed) internal tablist.
//
// This module owns no business/result state itself — it is driven entirely
// by main.js/result-page.js via setProfiles()/setActivePage()/
// setActiveProfile(), so there is exactly one authority (result-page.js's
// currentResult/activeTab) for "what profiles exist" and "which is active".
import { t, subscribeLanguage } from "./i18n.js";

export const MAIN_PAGE = {
  INPUT_OVERVIEW: "input-overview",
  RESULTS: "results",
};

export function mountAppNav(container, { onNavigateInputOverview, onNavigateProfile } = {}) {
  let activePage = MAIN_PAGE.INPUT_OVERVIEW;
  let activeProfileId = null;
  // [{ id, badgeText }], present-only, canonical HYNC/SLNC/ESG order — set
  // via setProfiles() below, never computed here.
  let profiles = [];

  const nav = document.createElement("div");
  nav.className = "app-nav";

  const inputBtn = document.createElement("button");
  inputBtn.type = "button";
  inputBtn.className = "app-nav-btn";
  inputBtn.addEventListener("click", () => {
    if (onNavigateInputOverview) onNavigateInputOverview();
  });

  // Rebuilt fresh on every render() (profile set only ever changes on a new
  // cleaning run/reset/language change, never per keystroke) rather than
  // diffed — matching the "always rebuild" style already used throughout
  // this app's other tab/selector renderers.
  const profilesRow = document.createElement("div");
  profilesRow.className = "app-nav-profiles";

  function buildProfileButton(profile) {
    const isActive = activePage === MAIN_PAGE.RESULTS && activeProfileId === profile.id;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = isActive ? "app-nav-btn app-nav-profile-btn app-nav-btn-active" : "app-nav-btn app-nav-profile-btn";
    btn.setAttribute("aria-current", isActive ? "page" : "false");

    const label = document.createElement("span");
    label.className = "app-nav-profile-label";
    label.textContent = profile.id;
    btn.appendChild(label);

    if (profile.badgeText) {
      const badge = document.createElement("span");
      badge.className = "app-nav-profile-badge";
      badge.textContent = profile.badgeText;
      btn.appendChild(badge);
    }

    btn.addEventListener("click", () => {
      if (onNavigateProfile) onNavigateProfile(profile.id);
    });
    return btn;
  }

  function render() {
    inputBtn.textContent = t("page1.title");
    const isInputActive = activePage === MAIN_PAGE.INPUT_OVERVIEW;
    inputBtn.setAttribute("aria-current", isInputActive ? "page" : "false");
    inputBtn.classList.toggle("app-nav-btn-active", isInputActive);

    // Profile buttons are rebuilt from scratch below (innerHTML = ""), which
    // would otherwise silently drop keyboard focus to <body> when a profile
    // button is activated via Enter/Space — the very button that had focus
    // is destroyed mid-click. Restore focus to the new active profile button
    // afterward whenever a profile button held it beforehand.
    const hadProfileFocus = profilesRow.contains(document.activeElement);

    profilesRow.innerHTML = "";
    let activeProfileBtn = null;
    profiles.forEach((profile) => {
      const btn = buildProfileButton(profile);
      if (btn.classList.contains("app-nav-btn-active")) activeProfileBtn = btn;
      profilesRow.appendChild(btn);
    });

    if (hadProfileFocus && activeProfileBtn) activeProfileBtn.focus();
  }

  nav.appendChild(inputBtn);
  nav.appendChild(profilesRow);
  container.appendChild(nav);

  subscribeLanguage(render);
  render();

  return {
    // Called whenever the cleaning result changes (new run, reset) with the
    // present-only profile list + each profile's tab badge text
    // (result-page.js's own profileTabBadgeText) — so this nav and the
    // Results workspace never disagree on which profiles exist.
    setProfiles(nextProfiles) {
      profiles = nextProfiles || [];
      render();
    },
    // Which conceptual Main Page is highlighted. Set from main.js's
    // switchToPage() — the single place that also toggles the two page
    // containers' visibility — so this nav's own highlighting can never
    // drift from what is actually on screen.
    setActivePage(page) {
      activePage = page === MAIN_PAGE.RESULTS ? MAIN_PAGE.RESULTS : MAIN_PAGE.INPUT_OVERVIEW;
      render();
    },
    // Which profile button is highlighted while Main Page 2 is active. Set
    // from result-page.js's own active-tab changes (a direct profile-button
    // click, Page 1's "Open Group" contextual navigation, or a result-set
    // change that falls back to a different profile) — irrelevant, but
    // harmless, while Main Page 1 is active.
    setActiveProfile(profileId) {
      activeProfileId = profileId || null;
      render();
    },
  };
}
