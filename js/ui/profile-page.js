import { rowsToTsv } from "../core/tsv-exporter.js";
import { formatDateOnly, formatDecimal, extractNumericGrade } from "../core/output-formatter.js";
import { renderValidation } from "./validation-panel.js";
import { copyToClipboard } from "./clipboard-utils.js";

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

export function renderProfilePagePlaceholder(container) {
  container.innerHTML = "";

  const placeholder = document.createElement("p");
  placeholder.className = "placeholder-text";
  placeholder.textContent = "No rows for this profile yet.";

  container.appendChild(placeholder);
}

function renderSummaryTable(
  container,
  title,
  entries,
  decimalSeparator,
  formatKey = (key) => key
) {
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
    [
      formatKey(entry.key),
      String(entry.rowCount),
      formatDecimal(entry.netTotal, decimalSeparator),
    ].forEach((text) => {
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

function renderOperationalSummary(container, entries, decimalSeparator) {
  const wrap = document.createElement("div");
  wrap.className = "summary-table-wrap";

  const heading = document.createElement("h4");
  heading.textContent = "Operational Summary";
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
  table.className = "summary-table operational-summary-table";

  const thead = document.createElement("thead");
  thead.innerHTML =
    "<tr><th>PILE ID</th><th>Source</th><th>Contractor</th><th>Rows</th>" +
    "<th>Net Total</th><th>Remark</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  entries.forEach((entry) => {
    const tr = document.createElement("tr");
    if (entry.remark) tr.className = "operational-summary-row-flagged";
    [
      entry.pileId || "(blank)",
      entry.source || "(blank)",
      entry.contractor || "(blank)",
      String(entry.rowCount),
      formatDecimal(entry.netTotal, decimalSeparator),
      entry.remark || "",
    ].forEach((text) => {
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

function renderShiftWarningRows(container, group) {
  const rows = group.validation.shiftWarningRows;
  const wrap = document.createElement("div");
  wrap.className = "summary-table-wrap";

  const heading = document.createElement("h4");
  heading.textContent = `Shift Warning Rows (${rows.length})`;
  wrap.appendChild(heading);

  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "placeholder-text";
    empty.textContent = "None. Every row's detected shift matches the declared bucket.";
    wrap.appendChild(empty);
    container.appendChild(wrap);
    return;
  }

  const note = document.createElement("p");
  note.className = "placeholder-text";
  note.textContent =
    "These rows remain part of this profile's operational group for copy/paste; " +
    "review them because their own timestamp falls outside the declared shift window.";
  wrap.appendChild(note);

  const table = document.createElement("table");
  table.className = "summary-table";

  const thead = document.createElement("thead");
  thead.innerHTML =
    "<tr><th>NO.NOTA</th><th>Datetime</th><th>Detected Shift</th><th>Declared Bucket</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    [
      String(row["NO.NOTA"]),
      row.Datetime instanceof Date ? formatDateOnly(row.Datetime) : "",
      String(row.Shift ?? ""),
      group.bucket,
    ].forEach((text) => {
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

function renderShiftWarningBanner(container, group) {
  const count = group.validation.shiftWarningCount;
  if (!count) return;

  const banner = document.createElement("ul");
  banner.className = "warning-list";
  const li = document.createElement("li");
  li.textContent = `${count} row(s) have timestamps outside the declared shift window.`;
  banner.appendChild(li);
  container.appendChild(banner);
}

function renderProfileGroup(group, decimalSeparator) {
  const details = document.createElement("details");
  details.className = "group-details";
  details.open = true;

  const summary = document.createElement("summary");
  const summaryLine = document.createElement("span");
  summaryLine.className = "group-summary-line";
  summaryLine.appendChild(createChip(group.profile, "group-chip-profile"));
  summaryLine.appendChild(createChip(group.date, "group-chip-date"));
  summaryLine.appendChild(createChip(`Bucket: ${group.bucket}`, "group-chip-shift"));
  summaryLine.appendChild(createChip(`${group.rows.length} rows`));
  summaryLine.appendChild(createChip(group.sourceFiles.join(", ")));
  if (group.validation.shiftWarningCount) {
    summaryLine.appendChild(
      createChip(`${group.validation.shiftWarningCount} shift warning(s)`, "group-chip-warning")
    );
  }
  summary.appendChild(summaryLine);
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "group-details-body";

  renderShiftWarningBanner(body, group);

  const validationHeading = document.createElement("h4");
  validationHeading.textContent = "Validation Report";
  body.appendChild(validationHeading);
  renderValidation(body, group.validation, decimalSeparator);

  const operationalHeading = document.createElement("h4");
  operationalHeading.textContent = "Main Summary";
  body.appendChild(operationalHeading);
  renderOperationalSummary(body, group.summary.operational, decimalSeparator);

  const detailDetails = document.createElement("details");
  detailDetails.className = "additional-breakdown-details";
  const detailSummary = document.createElement("summary");
  detailSummary.textContent = "Additional Breakdown (Contractor / PILE ID / Source / Grade)";
  detailDetails.appendChild(detailSummary);
  renderSummaryTable(detailDetails, "By Contractor", group.summary.byContractor, decimalSeparator);
  renderSummaryTable(detailDetails, "By PILE ID", group.summary.byPileId, decimalSeparator);
  renderSummaryTable(detailDetails, "By Source", group.summary.bySource, decimalSeparator);
  renderSummaryTable(
    detailDetails,
    "By Grade",
    group.summary.byGrade,
    decimalSeparator,
    formatGradeKey(decimalSeparator)
  );
  body.appendChild(detailDetails);

  renderUnmatchedDt(body, group.validation.unmatchedDtRows);
  renderShiftWarningRows(body, group);
  renderPreview(body, group.rows, decimalSeparator);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "Copy This Profile";
  copyBtn.addEventListener("click", () => {
    const tsv = rowsToTsv(group.rows, { includeHeader: false, decimalSeparator });
    copyToClipboard(tsv, copyBtn);
  });
  body.appendChild(copyBtn);

  details.appendChild(body);
  return details;
}

export function renderProfilePage(container, groups, decimalSeparator = ".") {
  container.innerHTML = "";

  if (!groups.length) {
    renderProfilePagePlaceholder(container);
    return;
  }

  groups.forEach((group) => {
    container.appendChild(renderProfileGroup(group, decimalSeparator));
  });
}
