import { t, subscribeLanguage } from "./i18n.js";

export function mountActionBar(container, { onRefresh, onCopyAll, onCopyProfile } = {}) {
  let lastHasResults = false;

  const bar = document.createElement("div");
  bar.id = "bottom-action-bar";

  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.className = "btn-primary";
  refreshBtn.textContent = t("results.startCleaning");
  refreshBtn.addEventListener("click", () => {
    if (onRefresh) onRefresh();
  });

  const copyAllBtn = document.createElement("button");
  copyAllBtn.type = "button";
  copyAllBtn.className = "btn-secondary";
  copyAllBtn.textContent = t("results.copyAll");
  copyAllBtn.addEventListener("click", () => {
    if (onCopyAll) onCopyAll(copyAllBtn);
  });

  const copyProfileBtn = document.createElement("button");
  copyProfileBtn.type = "button";
  copyProfileBtn.className = "btn-secondary";
  copyProfileBtn.textContent = t("results.copyProfile");
  copyProfileBtn.addEventListener("click", () => {
    if (onCopyProfile) onCopyProfile(copyProfileBtn);
  });

  bar.appendChild(refreshBtn);
  bar.appendChild(copyAllBtn);
  bar.appendChild(copyProfileBtn);
  container.appendChild(bar);

  function update({ hasFiles, hasResults, isProfileTab, allBlocked, profileBlocked }) {
    lastHasResults = Boolean(hasResults);
    refreshBtn.textContent = hasResults ? t("results.refreshCleaning") : t("results.startCleaning");
    refreshBtn.disabled = !hasFiles;
    copyAllBtn.disabled = !hasResults || Boolean(allBlocked);
    copyProfileBtn.disabled = !hasResults || !isProfileTab || Boolean(profileBlocked);
  }

  // Persistent, mounted once — re-renders its own button text (respecting
  // whichever hasResults state the last update() call left it in) on a
  // language change, without altering enabled/disabled state.
  subscribeLanguage(() => {
    refreshBtn.textContent = lastHasResults ? t("results.refreshCleaning") : t("results.startCleaning");
    copyAllBtn.textContent = t("results.copyAll");
    copyProfileBtn.textContent = t("results.copyProfile");
  });

  return { update, copyAllBtn, copyProfileBtn };
}
