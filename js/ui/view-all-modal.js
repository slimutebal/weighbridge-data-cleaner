import { formatOutputCell } from "../core/output-formatter.js";
import { OUTPUT_COLUMN_ORDER } from "../core/tsv-exporter.js";
import { t } from "./i18n.js";
import { attachScrollEdgeIndicators } from "./scroll-edge-indicators.js";
import { NUMERIC_OUTPUT_COLUMNS, TABLE_HEADER_NUMERIC_CLASS, TABLE_CELL_NUMERIC_CLASS } from "./table-utils.js";

let dialogEl = null;
let lastTrigger = null;
// Identity of the group currently backing the open dialog (or null when
// closed). Lets callers force-close the panel from outside — profile
// change, group change, Refresh Cleaning, Clear/Reset (section 12/14) —
// without needing to know whether it is actually open.
let openGroupKey = null;
// Scroll-edge-indicator cleanup for whatever table wrapper the currently
// open dialog last built (Phase C2) — cleared and reattached every time
// openViewAllRowsModal() rebuilds dialog.innerHTML, so re-opening (or
// opening for a different group) never leaks a ResizeObserver/listener
// from the previous table.
let scrollCleanup = null;

function ensureDialog() {
  if (dialogEl) return dialogEl;
  dialogEl = document.createElement("dialog");
  dialogEl.className = "secondary-dialog view-all-modal";
  dialogEl.setAttribute("aria-labelledby", "view-all-modal-title");
  document.body.appendChild(dialogEl);
  // Native <dialog> handles Escape-to-close and focus trapping; this only
  // adds returning focus to whichever "View All" button opened it, so
  // keyboard users land back where they were instead of at document top.
  dialogEl.addEventListener("close", () => {
    openGroupKey = null;
    if (lastTrigger) lastTrigger.focus();
  });
  return dialogEl;
}

function buildTable(rows, decimalSeparator) {
  const wrap = document.createElement("div");
  wrap.className = "view-all-table-wrap";

  const table = document.createElement("table");
  table.className = "summary-table view-all-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  OUTPUT_COLUMN_ORDER.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col;
    if (NUMERIC_OUTPUT_COLUMNS.has(col)) th.classList.add(TABLE_HEADER_NUMERIC_CLASS);
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  // Same clean row objects used by TSV output (rowsToTsv) — no second
  // transformed copy of the clean dataset is created for this view.
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    OUTPUT_COLUMN_ORDER.forEach((col) => {
      const td = document.createElement("td");
      td.textContent = formatOutputCell(row, col, decimalSeparator);
      if (NUMERIC_OUTPUT_COLUMNS.has(col)) td.classList.add(TABLE_CELL_NUMERIC_CLASS);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  wrap.appendChild(table);
  return wrap;
}

// groupInfo: { groupKey, profile, date, bucket, rows }
export function openViewAllRowsModal(groupInfo, decimalSeparator, triggerButton) {
  const { groupKey, profile, date, bucket, rows } = groupInfo;
  lastTrigger = triggerButton || null;
  openGroupKey = groupKey;

  if (scrollCleanup) {
    scrollCleanup();
    scrollCleanup = null;
  }

  const dialog = ensureDialog();
  dialog.innerHTML = "";

  const header = document.createElement("div");
  header.className = "view-all-header";

  const titleWrap = document.createElement("div");
  const title = document.createElement("h3");
  title.id = "view-all-modal-title";
  title.textContent = t("results.cleanDataPreview");
  titleWrap.appendChild(title);
  const subtitle = document.createElement("p");
  subtitle.className = "view-all-subtitle";
  subtitle.textContent = t("results.viewAllSubtitle", { profile, date, bucket, count: rows.length });
  titleWrap.appendChild(subtitle);
  header.appendChild(titleWrap);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn-secondary";
  closeBtn.textContent = t("common.close");
  closeBtn.addEventListener("click", () => dialog.close());
  header.appendChild(closeBtn);

  const tableWrap = buildTable(rows, decimalSeparator);
  dialog.appendChild(header);
  dialog.appendChild(tableWrap);
  scrollCleanup = attachScrollEdgeIndicators(tableWrap);

  dialog.showModal();
}

// Force-closes the panel regardless of which group opened it. Safe to call
// even when nothing is open (section 14: every state-changing action closes
// View All unconditionally before re-rendering).
export function closeViewAllRowsModal() {
  if (dialogEl && dialogEl.open) {
    dialogEl.close();
  }
  openGroupKey = null;
}

// Lets a re-render decide whether to keep showing "View All" as active for
// a given group (e.g. to restyle its trigger button) without reaching into
// module-private state directly.
export function isViewAllOpenForGroup(groupKey) {
  return Boolean(dialogEl && dialogEl.open && openGroupKey === groupKey);
}
