import { loadListDt, refreshFromEndpointInBackground } from "../core/list-dt-manager.js";
import { loadAppConfig } from "../core/app-settings.js";
import { announce } from "./live-announcer.js";

function formatUpdatedAt(updatedAt) {
  if (!updatedAt) return "—";
  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export function mountListDtPage(container, { onUpdated } = {}) {
  const heading = document.createElement("h2");
  heading.textContent = "List DT (Master Data)";

  const statusLine = document.createElement("p");
  statusLine.className = "list-dt-status-line";

  const updateBtn = document.createElement("button");
  updateBtn.type = "button";
  updateBtn.className = "btn-secondary";
  updateBtn.textContent = "Update List DT";

  const feedback = document.createElement("p");
  feedback.className = "placeholder-text";

  container.appendChild(heading);
  container.appendChild(statusLine);
  container.appendChild(updateBtn);
  container.appendChild(feedback);

  async function refreshStatus() {
    const listDt = await loadListDt();
    statusLine.textContent = `Source: ${listDt.source} | Records: ${listDt.recordCount} | Duplicate DT ID conflicts: ${listDt.duplicates.length} | Last updated: ${formatUpdatedAt(listDt.updatedAt)}`;
  }

  updateBtn.addEventListener("click", async () => {
    updateBtn.disabled = true;
    feedback.textContent = "Updating from Google Sheet...";

    const appConfig = await loadAppConfig();
    const result = await refreshFromEndpointInBackground(appConfig.listDtEndpoint);

    if (result.ok) {
      feedback.textContent = `List DT updated: ${result.recordCount} record(s) cached.`;
      announce("List DT updated.");
      await refreshStatus();
      if (onUpdated) await onUpdated();
    } else {
      feedback.textContent = `List DT update failed (${result.reason}). Using cached/bundled List DT.`;
      announce("List DT update failed.");
    }

    updateBtn.disabled = false;
  });

  refreshStatus();

  return { refreshStatus };
}
