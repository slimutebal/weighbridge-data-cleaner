import { rowsToTsv } from "../core/tsv-exporter.js";
import { formatDateOnly, formatDecimal, extractNumericGrade } from "../core/output-formatter.js";
import { renderValidation } from "./validation-panel.js";

const PREVIEW_COLUMNS = [
  "TANGGAL",
  "NO. DT",
  "Contractor",
  "Shift",
  "Datetime",
  "NO.NOTA",
  "Type",
  "Buyer",
  "Net",
  "PILE ID",
  "Source",
  "Grade",
  "Profile",
];
const PREVIEW_ROW_LIMIT = 20;

export function renderGroupTabsPlaceholder(container) {
  container.innerHTML = "";

  const placeholder = document.createElement("p");
  placeholder.className = "placeholder-text";
  placeholder.textContent =
    "No cleaning groups yet. Import files and run cleaning to see results grouped by Profile + Date + Shift.";

  container.appendChild(placeholder);
}

function renderWarningList(container, items, className) {
  const list = document.createElement("ul");
  list.className = className;
  items.forEach(({ message }) => {
    const li = document.createElement("li");
    li.textContent = message;
    list.appendChild(li);
  });
  container.appendChild(list);
}

function renderSummaryTable(container, title, entries, formatKey = (key) => key) {
  const wrap = document.createElement("div");
  wrap.className = "summary-table-wrap";

  const heading = document.createElement("h4");
  heading.textContent = title;
  wrap.appendChild(heading);

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "placeholder-text";
    empty.textContent = "No data.";
    wrap.appendChild(empty);
    container.appendChild(wrap);
    return;
  }

  const table = document.createElement("table");
  table.className = "summary-table";

  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Key</th><th>Rows</th><th>Net Total</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  entries.forEach((entry) => {
    const tr = document.createElement("tr");
    [formatKey(entry.key), String(entry.rowCount), entry.netTotal.toFixed(2)].forEach((text) => {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  wrap.appendChild(table);
  container.appendChild(wrap);
}

function renderUnmatchedDt(container, rows) {
  const wrap = document.createElement("div");
  wrap.className = "summary-table-wrap";

  const heading = document.createElement("h4");
  heading.textContent = `Unmatched DT Rows (${rows.length})`;
  wrap.appendChild(heading);

  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "placeholder-text";
    empty.textContent = "None.";
    wrap.appendChild(empty);
    container.appendChild(wrap);
    return;
  }

  const table = document.createElement("table");
  table.className = "summary-table";

  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>NO.NOTA</th><th>Raw NO. DT</th><th>Normalized</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    [String(row["NO.NOTA"]), String(row._rawDtId ?? ""), String(row["NO. DT"])].forEach(
      (text) => {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      }
    );
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  wrap.appendChild(table);
  container.appendChild(wrap);
}

function formatPreviewCell(row, column, decimalSeparator) {
  const value = row[column];
  if (column === "Datetime" && value instanceof Date) {
    return formatDateOnly(value);
  }
  if (column === "Net" && typeof value === "number") {
    return formatDecimal(value, decimalSeparator);
  }
  if (column === "Grade") {
    const numericGrade = extractNumericGrade(value);
    return numericGrade === null ? "" : formatDecimal(numericGrade, decimalSeparator);
  }
  return value === undefined || value === null ? "" : String(value);
}

function renderPreview(container, rows, decimalSeparator) {
  const wrap = document.createElement("div");
  wrap.className = "summary-table-wrap";

  const shown = Math.min(PREVIEW_ROW_LIMIT, rows.length);
  const heading = document.createElement("h4");
  heading.textContent = `Clean Data Preview (first ${shown} of ${rows.length})`;
  wrap.appendChild(heading);

  const table = document.createElement("table");
  table.className = "summary-table preview-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  PREVIEW_COLUMNS.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.slice(0, PREVIEW_ROW_LIMIT).forEach((row) => {
    const tr = document.createElement("tr");
    PREVIEW_COLUMNS.forEach((col) => {
      const td = document.createElement("td");
      td.textContent = formatPreviewCell(row, col, decimalSeparator);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  wrap.appendChild(table);
  container.appendChild(wrap);
}

async function copyToClipboard(text, button) {
  const originalText = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied!";
  } catch (error) {
    console.error("Clipboard copy failed:", error);
    button.textContent = "Copy failed";
  }
  setTimeout(() => {
    button.textContent = originalText;
  }, 1500);
}

function createChip(text, extraClass) {
  const chip = document.createElement("span");
  chip.className = extraClass ? `group-chip ${extraClass}` : "group-chip";
  chip.textContent = text;
  return chip;
}

function formatGradeKey(decimalSeparator) {
  return (key) => {
    const numericGrade = extractNumericGrade(key);
    return numericGrade === null ? key : formatDecimal(numericGrade, decimalSeparator);
  };
}

function renderGroupDetails(group, decimalSeparator) {
  const details = document.createElement("details");
  details.className = "group-details";

  const summary = document.createElement("summary");
  const summaryLine = document.createElement("span");
  summaryLine.className = "group-summary-line";
  summaryLine.appendChild(createChip(group.profile, "group-chip-profile"));
  summaryLine.appendChild(createChip(group.date, "group-chip-date"));
  summaryLine.appendChild(createChip(group.shift, "group-chip-shift"));
  summaryLine.appendChild(createChip(`${group.rows.length} rows`));
  summaryLine.appendChild(createChip(group.sourceFiles.join(", ")));
  summaryLine.appendChild(createChip(`Bucket: ${group.buckets.join(", ")}`));
  summary.appendChild(summaryLine);
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "group-details-body";

  const validationHeading = document.createElement("h4");
  validationHeading.textContent = "Validation Report";
  body.appendChild(validationHeading);
  renderValidation(body, group.validation);

  const summaryHeading = document.createElement("h4");
  summaryHeading.textContent = "Summary Report";
  body.appendChild(summaryHeading);
  renderSummaryTable(body, "By Contractor", group.summary.byContractor);
  renderSummaryTable(body, "By PILE ID", group.summary.byPileId);
  renderSummaryTable(body, "By Source", group.summary.bySource);
  renderSummaryTable(body, "By Grade", group.summary.byGrade, formatGradeKey(decimalSeparator));

  renderUnmatchedDt(body, group.validation.unmatchedDtRows);
  renderPreview(body, group.rows, decimalSeparator);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "Copy This Group";
  copyBtn.addEventListener("click", () => {
    const tsv = rowsToTsv(group.rows, { includeHeader: false, decimalSeparator });
    copyToClipboard(tsv, copyBtn);
  });
  body.appendChild(copyBtn);

  details.appendChild(body);
  return details;
}

export function renderGroups(
  container,
  { groups = [], warnings = [], fileErrors = [] },
  decimalSeparator = "."
) {
  container.innerHTML = "";

  if (fileErrors.length) {
    renderWarningList(
      container,
      fileErrors.map((e) => ({ message: `${e.fileName}: ${e.message}` })),
      "warning-list warning-list-error"
    );
  }

  const infoNotices = warnings.filter((w) => w.type === "skipped-non-detail");
  const realWarnings = warnings.filter((w) => w.type !== "skipped-non-detail");

  if (realWarnings.length) {
    renderWarningList(container, realWarnings, "warning-list");
  }

  if (infoNotices.length) {
    renderWarningList(container, infoNotices, "warning-list warning-list-info");
  }

  if (!groups.length) {
    const placeholder = document.createElement("p");
    placeholder.className = "placeholder-text";
    placeholder.textContent = fileErrors.length
      ? "No cleaning groups detected from the imported files."
      : "No cleaning groups yet. Import files to see results grouped by Profile + Date + Shift.";
    container.appendChild(placeholder);
    return;
  }

  groups.forEach((group) => {
    container.appendChild(renderGroupDetails(group, decimalSeparator));
  });
}
