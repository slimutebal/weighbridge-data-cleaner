export function mountActionBar(container, { onRefresh, onCopyAll, onCopyProfile } = {}) {
  const bar = document.createElement("div");
  bar.id = "bottom-action-bar";

  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.textContent = "Start Cleaning";
  refreshBtn.addEventListener("click", () => {
    if (onRefresh) onRefresh();
  });

  const copyAllBtn = document.createElement("button");
  copyAllBtn.type = "button";
  copyAllBtn.textContent = "Copy All Groups";
  copyAllBtn.addEventListener("click", () => {
    if (onCopyAll) onCopyAll(copyAllBtn);
  });

  const copyProfileBtn = document.createElement("button");
  copyProfileBtn.type = "button";
  copyProfileBtn.textContent = "Copy This Profile";
  copyProfileBtn.addEventListener("click", () => {
    if (onCopyProfile) onCopyProfile(copyProfileBtn);
  });

  bar.appendChild(refreshBtn);
  bar.appendChild(copyAllBtn);
  bar.appendChild(copyProfileBtn);
  container.appendChild(bar);

  function update({ hasFiles, hasResults, isProfileTab }) {
    refreshBtn.textContent = hasResults ? "Refresh Cleaning" : "Start Cleaning";
    refreshBtn.disabled = !hasFiles;
    copyAllBtn.disabled = !hasResults;
    copyProfileBtn.disabled = !hasResults || !isProfileTab;
  }

  return { update, copyAllBtn, copyProfileBtn };
}
