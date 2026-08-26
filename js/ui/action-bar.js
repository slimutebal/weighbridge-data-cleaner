import { t, subscribeLanguage } from "./i18n.js";

export function mountActionBar(container, { onCopyAll, onCopyProfile } = {}) {
  const bar = document.createElement("div");
  bar.id = "bottom-action-bar";

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

  bar.appendChild(copyAllBtn);
  bar.appendChild(copyProfileBtn);
  container.appendChild(bar);

  function update({ hasResults, isProfileTab, allBlocked, profileBlocked }) {
    copyAllBtn.disabled = !hasResults || Boolean(allBlocked);
    copyProfileBtn.disabled = !hasResults || !isProfileTab || Boolean(profileBlocked);
  }

  // Persistent, mounted once — re-renders its own button text on a language
  // change without altering enabled/disabled state.
  subscribeLanguage(() => {
    copyAllBtn.textContent = t("results.copyAll");
    copyProfileBtn.textContent = t("results.copyProfile");
  });

  return { update, copyAllBtn, copyProfileBtn };
}
