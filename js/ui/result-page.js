import { renderGroupTabsPlaceholder, renderGroups } from "./result-group-tabs.js";
import { rowsToTsv } from "../core/tsv-exporter.js";

export function mountResultPage(container, { decimalSeparator = "." } = {}) {
  const heading = document.createElement("h2");
  heading.textContent = "Cleaning Results";

  const groupsSection = document.createElement("div");
  groupsSection.className = "result-section";
  const groupsHeading = document.createElement("h3");
  groupsHeading.textContent = "Groups";
  const groupsBody = document.createElement("div");
  groupsSection.appendChild(groupsHeading);
  groupsSection.appendChild(groupsBody);

  const statusSection = document.createElement("div");
  statusSection.className = "result-section";
  const statusHeading = document.createElement("h3");
  statusHeading.textContent = "List DT Status";
  const statusBody = document.createElement("div");
  statusSection.appendChild(statusHeading);
  statusSection.appendChild(statusBody);

  const tsvSection = document.createElement("div");
  tsvSection.className = "result-section";
  const tsvHeading = document.createElement("h3");
  tsvHeading.textContent = "Output";
  const tsvBody = document.createElement("div");
  const tsvPlaceholder = document.createElement("p");
  tsvPlaceholder.className = "placeholder-text";
  tsvPlaceholder.textContent = "Import files to enable TSV output.";

  const copyAllBtn = document.createElement("button");
  copyAllBtn.type = "button";
  copyAllBtn.textContent = "Copy All Groups";
  copyAllBtn.disabled = true;

  tsvBody.appendChild(tsvPlaceholder);
  tsvBody.appendChild(copyAllBtn);
  tsvSection.appendChild(tsvHeading);
  tsvSection.appendChild(tsvBody);

  container.appendChild(heading);
  container.appendChild(groupsSection);
  container.appendChild(statusSection);
  container.appendChild(tsvSection);

  let currentGroups = [];

  async function copyAll() {
    const allRows = currentGroups.flatMap((group) => group.rows);
    const tsv = rowsToTsv(allRows, { includeHeader: false, decimalSeparator });
    const originalText = copyAllBtn.textContent;
    try {
      await navigator.clipboard.writeText(tsv);
      copyAllBtn.textContent = "Copied!";
    } catch (error) {
      console.error("Clipboard copy failed:", error);
      copyAllBtn.textContent = "Copy failed";
    }
    setTimeout(() => {
      copyAllBtn.textContent = originalText;
    }, 1500);
  }

  copyAllBtn.addEventListener("click", copyAll);

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

  function reset() {
    currentGroups = [];
    renderGroupTabsPlaceholder(groupsBody);
    renderListDtStatus(null);
    copyAllBtn.disabled = true;
    tsvPlaceholder.style.display = "";
  }

  function showGroups(result) {
    currentGroups = result.groups || [];
    renderGroups(groupsBody, result, decimalSeparator);
    renderListDtStatus(result.listDtInfo);
    copyAllBtn.disabled = currentGroups.length === 0;
    tsvPlaceholder.style.display = currentGroups.length ? "none" : "";
  }

  reset();

  return { reset, showGroups };
}
