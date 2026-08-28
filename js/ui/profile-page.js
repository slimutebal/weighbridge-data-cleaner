import {
  formatFullDatetime,
  formatDecimal,
  formatOutputCell,
  extractNumericGrade,
} from "../core/output-formatter.js";
import { renderHeadlineMetrics, renderDetailedMetrics } from "./validation-panel.js";
import { computeGroupReadiness } from "../core/readiness.js";
import { getEffectiveValidation } from "./group-readiness.js";
import { WEIGHT_ISSUE_CODES, parseSourceRowId } from "../core/weight-integrity.js";
import { getApproval, revokeException } from "../core/weight-exception-store.js";
import { openWeightExceptionDialog } from "./weight-exception-dialog.js";
import { getLowNetApproval, revokeLowNetException } from "../core/low-net-weight-store.js";
import { openLowNetWeightDialog } from "./low-net-weight-dialog.js";
import { OUTPUT_COLUMN_ORDER } from "../core/tsv-exporter.js";
import { getGroupKey } from "../core/group-key.js";
import { openViewAllRowsModal } from "./view-all-modal.js";
import { renderDtCorrectionPanel } from "./dt-correction-panel.js";
import { t } from "./i18n.js";
import { attachScrollEdgeIndicators } from "./scroll-edge-indicators.js";
import { NUMERIC_OUTPUT_COLUMNS, TABLE_HEADER_NUMERIC_CLASS, TABLE_CELL_NUMERIC_CLASS } from "./table-utils.js";
import { createStatusBadge, bucketLabel, buildHeaderDetailText } from "./group-status-presentation.js";

// The three primary Cleaning Group sections (UI-5B §11) — group-level
// presentation tabs, never a business state. Exported so result-page.js
// (which owns the active-section state per profile) can reference the same
// enum instead of duplicating string literals.
export const GROUP_SECTION = {
  SUMMARY: "summary",
  VALIDATION: "validation",
  CLEAN_DATA: "cleanData",
};

const SECTION_ORDER = [GROUP_SECTION.SUMMARY, GROUP_SECTION.VALIDATION, GROUP_SECTION.CLEAN_DATA];

const SECTION_LABEL_KEY = {
  [GROUP_SECTION.SUMMARY]: "profile.section.summary",
  [GROUP_SECTION.VALIDATION]: "profile.section.validation",
  [GROUP_SECTION.CLEAN_DATA]: "profile.section.cleanData",
};

const PREVIEW_ROW_LIMIT = 25;

// Scroll-edge-indicator cleanup handles for whatever table wrappers the
// last renderProfilePage() call attached (Phase C2) — cleared and rebuilt
// at the top of every call, since renderProfilePage always rebuilds its
// whole container (container.innerHTML = "") and discards every previous
// table wrapper. Without this, each re-render (tab switch, decimal-format
// change, language change, group toggle) would leak one ResizeObserver +
// scroll listener per table wrapper from the previous render.
let activeScrollCleanups = [];

function resetScrollCleanups() {
  activeScrollCleanups.forEach((cleanup) => cleanup());
  activeScrollCleanups = [];
}

function attachTableScrollIndicators(wrap) {
  activeScrollCleanups.push(attachScrollEdgeIndicators(wrap));
}

// "Other Blocking Issues" categories are keyed by computeOtherBlockingIssues'
// stable `key` field (js/core/readiness.js) — used here instead of that
// function's own English `label` text, which is not translated.
const BLOCKING_CATEGORY_KEY = {
  missingSource: "blocking.missingSource",
  missingGrade: "blocking.missingGrade",
  duplicateNota: "blocking.duplicateNota",
  pileIdSourceConflict: "blocking.pileIdSourceConflict",
  lostRows: "blocking.lostRows",
};

// Maps each weight-integrity issue code (js/core/weight-integrity.js) to
// its translated per-row Issue column text (§11 of the phase spec).
const WEIGHT_ISSUE_LABEL_KEY = {
  [WEIGHT_ISSUE_CODES.WEIGHT_CALCULATION_MISMATCH]: "weightIntegrity.issue.mismatch",
  [WEIGHT_ISSUE_CODES.INVALID_GROSS_WEIGHT]: "weightIntegrity.issue.invalidGross",
  [WEIGHT_ISSUE_CODES.INVALID_TARE_WEIGHT]: "weightIntegrity.issue.invalidTare",
  [WEIGHT_ISSUE_CODES.INVALID_RECORDED_NET_WEIGHT]: "weightIntegrity.issue.invalidRecordedNet",
  [WEIGHT_ISSUE_CODES.NEGATIVE_WEIGHT_VALUE]: "weightIntegrity.issue.negativeWeight",
  [WEIGHT_ISSUE_CODES.GROSS_BELOW_TARE]: "weightIntegrity.issue.grossBelowTare",
};

// Formats a minor-units integer (js/core/weight-integrity.js) back to a
// human-readable source-precision value for display only — the comparison
// itself already happened on the exact scaled integer, never on this
// formatted string (§11: "Use the application decimal-format preference
// for display only").
function formatWeightMinorUnits(minorUnits, decimalPlaces, sourceUnit, decimalSeparator) {
  if (minorUnits === null || minorUnits === undefined || decimalPlaces === undefined) return "—";
  const scale = Math.pow(10, decimalPlaces);
  const fixed = (minorUnits / scale).toFixed(decimalPlaces);
  const withSeparator = decimalSeparator === "," ? fixed.replace(".", ",") : fixed;
  return sourceUnit ? `${withSeparator} ${sourceUnit}` : withSeparator;
}

// Difference must always show an explicit sign (§3, §11) — a positive
// difference means the calculated value is higher than the recorded Net.
function formatSignedWeightMinorUnits(minorUnits, decimalPlaces, sourceUnit, decimalSeparator) {
  if (minorUnits === null || minorUnits === undefined) return "—";
  const sign = minorUnits > 0 ? "+" : "";
  return `${sign}${formatWeightMinorUnits(minorUnits, decimalPlaces, sourceUnit, decimalSeparator)}`;
}

// "过磅明细#R27" -> "27"; falls back to the raw id if it doesn't match the
// sourceRowId shape emitted by the profile cleaners.
function extractSourceRowNumber(sourceRowId) {
  return parseSourceRowId(sourceRowId).sourceRowNumber || String(sourceRowId ?? "");
}

export function renderProfilePagePlaceholder(container) {
  container.innerHTML = "";

  const placeholder = document.createElement("p");
  placeholder.className = "placeholder-text";
  placeholder.textContent = t("results.noRowsProfile");

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
    empty.textContent = t("profile.noData");
    wrap.appendChild(empty);
    container.appendChild(wrap);
    return;
  }

  const table = document.createElement("table");
  table.className = "summary-table";

  // Key is a text/identifier column; Rows and Net Total are numeric
  // (Part 3: semantic hooks by column identity, never nth-child).
  const columns = [
    { label: t("profile.key"), numeric: false },
    { label: t("profile.rows"), numeric: true },
    { label: t("profile.netTotal"), numeric: true },
  ];

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach(({ label, numeric }) => {
    const th = document.createElement("th");
    th.textContent = label;
    if (numeric) th.classList.add(TABLE_HEADER_NUMERIC_CLASS);
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  entries.forEach((entry) => {
    const tr = document.createElement("tr");
    [
      formatKey(entry.key),
      String(entry.rowCount),
      formatDecimal(entry.netTotal, decimalSeparator),
    ].forEach((text, index) => {
      const td = document.createElement("td");
      td.textContent = text;
      if (columns[index].numeric) td.classList.add(TABLE_CELL_NUMERIC_CLASS);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  wrap.appendChild(table);
  container.appendChild(wrap);
  attachTableScrollIndicators(wrap);
}

function renderOperationalSummary(container, entries, decimalSeparator) {
  const wrap = document.createElement("div");
  wrap.className = "summary-table-wrap";

  const heading = document.createElement("h4");
  heading.textContent = t("profile.operationalSummary");
  wrap.appendChild(heading);

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "placeholder-text";
    empty.textContent = t("profile.noData");
    wrap.appendChild(empty);
    container.appendChild(wrap);
    return;
  }

  const table = document.createElement("table");
  table.className = "summary-table operational-summary-table";

  // PILE ID / Source / Contractor / Remark are identifier/text columns;
  // Rows and Net Total are numeric (Part 3).
  const columns = [
    { label: "PILE ID", numeric: false },
    { label: "Source", numeric: false },
    { label: "Contractor", numeric: false },
    { label: t("profile.rows"), numeric: true },
    { label: t("profile.netTotal"), numeric: true },
    { label: t("profile.remark"), numeric: false },
  ];

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach(({ label, numeric }) => {
    const th = document.createElement("th");
    th.textContent = label;
    if (numeric) th.classList.add(TABLE_HEADER_NUMERIC_CLASS);
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  entries.forEach((entry) => {
    const tr = document.createElement("tr");
    if (entry.remark) tr.className = "operational-summary-row-flagged";
    [
      entry.pileId || t("profile.blank"),
      entry.source || t("profile.blank"),
      entry.contractor || t("profile.blank"),
      String(entry.rowCount),
      formatDecimal(entry.netTotal, decimalSeparator),
      entry.remark || "",
    ].forEach((text, index) => {
      const td = document.createElement("td");
      td.textContent = text;
      if (columns[index].numeric) td.classList.add(TABLE_CELL_NUMERIC_CLASS);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  wrap.appendChild(table);
  container.appendChild(wrap);
  attachTableScrollIndicators(wrap);
}

function weightIntegrityKeyFields(wi) {
  return {
    sourceRowId: wi.sourceRowId,
    grossMinorUnits: wi.grossMinorUnits,
    tareMinorUnits: wi.tareMinorUnits,
    recordedNetMinorUnits: wi.recordedNetMinorUnits,
  };
}

function createResolutionSummary(effectiveValidation) {
  const wrap = document.createElement("div");
  wrap.className = "weight-exception-summary";
  [
    [t("profile.weightIntegrityTotalMismatches"), effectiveValidation.totalWeightMismatchCount],
    [t("profile.weightIntegrityUnresolved"), effectiveValidation.unresolvedWeightMismatchCount],
    [t("profile.weightIntegrityApproved"), effectiveValidation.approvedWeightExceptionCount],
  ].forEach(([label, value]) => {
    const item = document.createElement("span");
    item.className = "weight-exception-summary-item";
    const labelEl = document.createElement("span");
    labelEl.className = "weight-exception-summary-label";
    labelEl.textContent = `${label}: `;
    const valueEl = document.createElement("span");
    valueEl.className = "weight-exception-summary-value";
    valueEl.textContent = String(value);
    item.appendChild(labelEl);
    item.appendChild(valueEl);
    wrap.appendChild(item);
  });
  return wrap;
}

// Builds the Resolution Status + Action cells for one row. Only
// WEIGHT_CALCULATION_MISMATCH rows are ever actionable (§6) — every other
// weight issue type (invalid Gross/Tare/Recorded Net, negative weight,
// Gross below Tare) has no calculated-vs-recorded comparison to reason
// about and so has no resolution workflow; those rows show a fixed,
// non-interactive status instead.
function buildResolutionCells(row, group, groupId, decimalSeparator, onChanged) {
  const wi = row._weightIntegrity;
  const statusTd = document.createElement("td");
  const actionTd = document.createElement("td");

  if (wi.issueCode !== WEIGHT_ISSUE_CODES.WEIGHT_CALCULATION_MISMATCH) {
    statusTd.textContent = t("profile.weightIntegrityNotApplicable");
    return [statusTd, actionTd];
  }

  const approval = getApproval({ groupId, ...weightIntegrityKeyFields(wi) });

  if (approval) {
    const statusWrap = document.createElement("div");
    statusWrap.className = "resolution-status resolution-status-approved";
    const statusLine = document.createElement("div");
    statusLine.textContent = t("profile.weightIntegrityApprovedStatus");
    statusWrap.appendChild(statusLine);
    const detailLine = document.createElement("div");
    detailLine.className = "resolution-status-detail";
    detailLine.textContent = t("profile.weightIntegrityApprovedDetail", {
      confirmedBy: approval.confirmedBy,
      reference: approval.confirmationReference,
      time: new Date(approval.confirmedAt).toLocaleString(),
    });
    statusWrap.appendChild(detailLine);
    statusTd.appendChild(statusWrap);

    const revokeBtn = document.createElement("button");
    revokeBtn.type = "button";
    revokeBtn.className = "btn-secondary";
    revokeBtn.textContent = t("weightException.revoke");
    revokeBtn.addEventListener("click", () => {
      revokeException({ groupId, ...weightIntegrityKeyFields(wi) });
      if (onChanged) onChanged();
    });
    actionTd.appendChild(revokeBtn);
  } else {
    const statusWrap = document.createElement("span");
    statusWrap.className = "resolution-status resolution-status-unresolved";
    statusWrap.textContent = t("profile.weightIntegrityUnresolvedStatus");
    statusTd.appendChild(statusWrap);

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "btn-secondary";
    confirmBtn.textContent = t("weightException.confirmRow");
    confirmBtn.addEventListener("click", () => {
      openWeightExceptionDialog({ row, group, groupId, decimalSeparator }, onChanged, confirmBtn);
    });
    actionTd.appendChild(confirmBtn);
  }

  return [statusTd, actionTd];
}

// Weight Integrity Issues (v1.1.0 D010, resolution workflow added in
// v1.2.0 D011) is its own dedicated panel — never merged into Timestamp
// Window Notes, Unmatched DT Rows, or Other Blocking Issues (§3) — exactly
// one panel and one table for the whole group, one row per affected
// source row (§2), rendered only when at least one row has a weight
// issue. Recorded Net is shown as-is and never replaced; the row itself
// always remains visible in Clean Data Preview below regardless of
// resolution state.
function renderWeightIntegrityIssues(container, group, decimalSeparator, groupId, effectiveValidation, onChanged) {
  const rows = group.validation.weightIntegrityIssueRows;
  if (!rows || !rows.length) return;

  // Whether anything in this table still blocks copy (§12): the raw total
  // across every weight issue type, minus only the approved
  // WEIGHT_CALCULATION_MISMATCH rows — see applyApprovalsToValidation()
  // (js/core/weight-exception-store.js) for why this single subtraction is
  // always correct (approvals can only ever reduce the mismatch bucket).
  const hasUnresolved = effectiveValidation.weightIntegrityIssueCount > 0;

  const details = document.createElement("details");
  details.className = hasUnresolved ? "blocking-issues-details" : "info-details";
  details.open = hasUnresolved;

  const summary = document.createElement("summary");
  summary.textContent = hasUnresolved
    ? t("profile.weightIntegrityHeading", { count: rows.length })
    : t("profile.weightExceptionsApprovedHeading", { count: rows.length });
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = hasUnresolved ? "blocking-issues-body" : "info-details-body";

  const note = document.createElement("p");
  note.className = "placeholder-text";
  note.textContent = hasUnresolved
    ? t("profile.weightIntegrityNote")
    : t("profile.weightExceptionsApprovedNote");
  body.appendChild(note);

  body.appendChild(createResolutionSummary(effectiveValidation));

  const wrap = document.createElement("div");
  wrap.className = "summary-table-wrap";

  const table = document.createElement("table");
  table.className = "summary-table";

  const columns = [
    "Source Row",
    "NO.NOTA",
    "NO. DT",
    "Datetime",
    "PILE ID",
    "Gross",
    "Tare",
    "Recorded Net",
    "Calculated Net",
    "Difference",
    t("profile.weightIntegrityIssueColumn"),
    t("profile.weightIntegrityStatusColumn"),
    t("profile.weightIntegrityActionColumn"),
  ];
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const wi = row._weightIntegrity;
    const tr = document.createElement("tr");
    [
      extractSourceRowNumber(wi.sourceRowId),
      String(row["NO.NOTA"] ?? ""),
      String(row["NO. DT"] ?? ""),
      row.Datetime instanceof Date ? formatFullDatetime(row.Datetime) : "",
      String(row["PILE ID"] ?? ""),
      formatWeightMinorUnits(wi.grossMinorUnits, wi.decimalPlaces, wi.sourceUnit, decimalSeparator),
      formatWeightMinorUnits(wi.tareMinorUnits, wi.decimalPlaces, wi.sourceUnit, decimalSeparator),
      formatWeightMinorUnits(wi.recordedNetMinorUnits, wi.decimalPlaces, wi.sourceUnit, decimalSeparator),
      formatWeightMinorUnits(wi.calculatedNetMinorUnits, wi.decimalPlaces, wi.sourceUnit, decimalSeparator),
      formatSignedWeightMinorUnits(wi.differenceMinorUnits, wi.decimalPlaces, wi.sourceUnit, decimalSeparator),
      t(WEIGHT_ISSUE_LABEL_KEY[wi.issueCode] || wi.issueCode),
    ].forEach((text) => {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    });
    buildResolutionCells(row, group, groupId, decimalSeparator, onChanged).forEach((td) => tr.appendChild(td));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  attachTableScrollIndicators(wrap);
  body.appendChild(wrap);

  details.appendChild(body);
  container.appendChild(details);
}

function lowNetWeightKeyFields(lnw) {
  return {
    sourceRowId: lnw.sourceRowId,
    recordedNetMinorUnits: lnw.recordedNetMinorUnits,
  };
}

function createLowNetResolutionSummary(effectiveValidation) {
  const wrap = document.createElement("div");
  wrap.className = "weight-exception-summary";
  [
    [t("profile.lowNetWeightTotal"), effectiveValidation.totalLowNetCount],
    [t("profile.lowNetWeightUnresolved"), effectiveValidation.unresolvedLowNetCount],
    [t("profile.lowNetWeightApproved"), effectiveValidation.approvedLowNetExceptionCount],
  ].forEach(([label, value]) => {
    const item = document.createElement("span");
    item.className = "weight-exception-summary-item";
    const labelEl = document.createElement("span");
    labelEl.className = "weight-exception-summary-label";
    labelEl.textContent = `${label}: `;
    const valueEl = document.createElement("span");
    valueEl.className = "weight-exception-summary-value";
    valueEl.textContent = String(value);
    item.appendChild(labelEl);
    item.appendChild(valueEl);
    wrap.appendChild(item);
  });
  return wrap;
}

// Builds the Resolution Status + Action cells for one LOW_NET_WEIGHT row.
// Mirrors buildResolutionCells's approved/unresolved branches — every row
// in this table is always actionable (validation.lowNetWeightRows only
// ever contains rows with issueCode === LOW_NET_WEIGHT), unlike the
// weight-integrity table, which also carries non-actionable issue types.
function buildLowNetResolutionCells(row, group, groupId, decimalSeparator, onChanged) {
  const lnw = row._lowNetWeight;
  const statusTd = document.createElement("td");
  const actionTd = document.createElement("td");

  const approval = getLowNetApproval({ groupId, ...lowNetWeightKeyFields(lnw) });

  if (approval) {
    const statusWrap = document.createElement("div");
    statusWrap.className = "resolution-status resolution-status-approved";
    const statusLine = document.createElement("div");
    statusLine.textContent = t("profile.weightIntegrityApprovedStatus");
    statusWrap.appendChild(statusLine);
    const detailLine = document.createElement("div");
    detailLine.className = "resolution-status-detail";
    detailLine.textContent = t("profile.weightIntegrityApprovedDetail", {
      confirmedBy: approval.confirmedBy,
      reference: approval.confirmationReference,
      time: new Date(approval.confirmedAt).toLocaleString(),
    });
    statusWrap.appendChild(detailLine);
    statusTd.appendChild(statusWrap);

    const revokeBtn = document.createElement("button");
    revokeBtn.type = "button";
    revokeBtn.className = "btn-secondary";
    revokeBtn.textContent = t("weightException.revoke");
    revokeBtn.addEventListener("click", () => {
      revokeLowNetException({ groupId, ...lowNetWeightKeyFields(lnw) });
      if (onChanged) onChanged();
    });
    actionTd.appendChild(revokeBtn);
  } else {
    const statusWrap = document.createElement("span");
    statusWrap.className = "resolution-status resolution-status-unresolved";
    statusWrap.textContent = t("profile.weightIntegrityUnresolvedStatus");
    statusTd.appendChild(statusWrap);

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "btn-secondary";
    confirmBtn.textContent = t("weightException.confirmRow");
    confirmBtn.addEventListener("click", () => {
      openLowNetWeightDialog({ row, group, groupId, decimalSeparator }, onChanged, confirmBtn);
    });
    actionTd.appendChild(confirmBtn);
  }

  return [statusTd, actionTd];
}

// Low Net Weight Confirmation (v1.3.0, phase spec §9-10) is its own
// dedicated panel — never merged into Weight Calculation Mismatch,
// Unmatched DT Rows, Other Blocking Issues, or Timestamp Window Notes —
// exactly one panel and one table for the whole group, one row per
// affected source row, rendered only when at least one row is below the
// configured minimum threshold. Recorded Net is shown as-is and never
// replaced; the row itself always remains visible in Clean Data Preview
// below regardless of resolution state.
function renderLowNetWeightIssues(container, group, decimalSeparator, groupId, effectiveValidation, onChanged) {
  const rows = group.validation.lowNetWeightRows;
  if (!rows || !rows.length) return;

  const hasUnresolved = effectiveValidation.unresolvedLowNetCount > 0;

  const details = document.createElement("details");
  details.className = hasUnresolved ? "blocking-issues-details" : "info-details";
  details.open = hasUnresolved;

  const summary = document.createElement("summary");
  summary.textContent = hasUnresolved
    ? t("profile.lowNetWeightHeading", { count: rows.length })
    : t("profile.lowNetWeightApprovedHeading", { count: rows.length });
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = hasUnresolved ? "blocking-issues-body" : "info-details-body";

  const note = document.createElement("p");
  note.className = "placeholder-text";
  note.textContent = hasUnresolved
    ? t("profile.lowNetWeightNote")
    : t("profile.lowNetWeightApprovedNote");
  body.appendChild(note);

  body.appendChild(createLowNetResolutionSummary(effectiveValidation));

  const wrap = document.createElement("div");
  wrap.className = "summary-table-wrap";

  const table = document.createElement("table");
  table.className = "summary-table";

  const columns = [
    "Source Row",
    "NO.NOTA",
    "NO. DT",
    "Datetime",
    "PILE ID",
    t("weightException.recordedNet"),
    t("profile.lowNetWeightMinimumColumn"),
    t("profile.lowNetWeightBelowByColumn"),
    t("profile.weightIntegrityStatusColumn"),
    t("profile.weightIntegrityActionColumn"),
  ];
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const lnw = row._lowNetWeight;
    const tr = document.createElement("tr");
    [
      extractSourceRowNumber(lnw.sourceRowId),
      String(row["NO.NOTA"] ?? ""),
      String(row["NO. DT"] ?? ""),
      row.Datetime instanceof Date ? formatFullDatetime(row.Datetime) : "",
      String(row["PILE ID"] ?? ""),
      formatWeightMinorUnits(lnw.recordedNetMinorUnits, lnw.decimalPlaces, lnw.sourceUnit, decimalSeparator),
      formatWeightMinorUnits(lnw.thresholdMinorUnits, lnw.decimalPlaces, lnw.sourceUnit, decimalSeparator),
      formatWeightMinorUnits(lnw.belowThresholdMinorUnits, lnw.decimalPlaces, lnw.sourceUnit, decimalSeparator),
    ].forEach((text) => {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    });
    buildLowNetResolutionCells(row, group, groupId, decimalSeparator, onChanged).forEach((td) => tr.appendChild(td));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  attachTableScrollIndicators(wrap);
  body.appendChild(wrap);

  details.appendChild(body);
  container.appendChild(details);
}

// Timestamp Window Notes is informational only (never blocking): rendered
// only when count > 0, collapsed by default (section 9).
function renderShiftWarningRows(container, group) {
  const rows = group.validation.shiftWarningRows;
  if (!rows.length) return;

  const details = document.createElement("details");
  details.className = "info-details";
  details.open = false;

  const summary = document.createElement("summary");
  summary.textContent = t("profile.timestampWindowNotesHeading", { count: rows.length });
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "info-details-body";

  const note = document.createElement("p");
  note.className = "placeholder-text";
  note.textContent = t("profile.timestampWindowNote", { count: rows.length, bucket: group.bucket });
  body.appendChild(note);

  const wrap = document.createElement("div");
  wrap.className = "summary-table-wrap";

  const table = document.createElement("table");
  table.className = "summary-table";

  const thead = document.createElement("thead");
  thead.innerHTML =
    "<tr><th>NO.NOTA</th><th>Datetime</th><th>Nominal Time Window</th><th>Final Operational Shift</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    [
      String(row["NO.NOTA"]),
      row.Datetime instanceof Date ? formatFullDatetime(row.Datetime) : "",
      String(row._detectedShift ?? ""),
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
  attachTableScrollIndicators(wrap);
  body.appendChild(wrap);

  details.appendChild(body);
  container.appendChild(details);
}

// One row-listing block per blocking category inside Other Blocking Issues.
function renderBlockingCategory(container, category) {
  const wrap = document.createElement("div");
  wrap.className = "summary-table-wrap";

  const categoryLabel = t(BLOCKING_CATEGORY_KEY[category.key] || category.label);
  const heading = document.createElement("h4");
  heading.textContent = `${categoryLabel} (${category.count})`;
  wrap.appendChild(heading);

  if (!category.rows || !category.rows.length) {
    const note = document.createElement("p");
    note.className = "placeholder-text";
    note.textContent = t("profile.blockingCategoryNoRows");
    wrap.appendChild(note);
    container.appendChild(wrap);
    return;
  }

  const table = document.createElement("table");
  table.className = "summary-table";

  const thead = document.createElement("thead");
  thead.innerHTML =
    "<tr><th>NO.NOTA</th><th>PILE ID</th><th>Source</th><th>Grade</th><th>Contractor</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  category.rows.forEach((row) => {
    const tr = document.createElement("tr");
    [
      String(row["NO.NOTA"] ?? ""),
      String(row["PILE ID"] ?? ""),
      String(row.Source ?? ""),
      String(row.Grade ?? ""),
      String(row.Contractor ?? ""),
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
  attachTableScrollIndicators(wrap);
}

// Other Blocking Issues covers every blocking category besides Unmatched DT
// (which has its own panel above) — rendered only when at least one
// category has a count > 0, expanded by default (section 11).
function renderOtherBlockingIssues(container, readiness) {
  const categories = readiness.otherBlocking;
  if (!categories.length) return;

  const details = document.createElement("details");
  details.className = "blocking-issues-details";
  details.open = true;

  const summary = document.createElement("summary");
  summary.textContent = t("profile.otherBlockingHeading", { count: readiness.otherBlockingCount });
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "blocking-issues-body";
  categories.forEach((category) => renderBlockingCategory(body, category));
  details.appendChild(body);

  container.appendChild(details);
}

function renderPreview(container, group, groupKey, decimalSeparator) {
  const rows = group.rows;
  const wrap = document.createElement("div");
  wrap.className = "summary-table-wrap";

  const heading = document.createElement("h4");
  heading.textContent = t("results.cleanDataPreview");
  wrap.appendChild(heading);

  const shown = Math.min(PREVIEW_ROW_LIMIT, rows.length);

  const previewActions = document.createElement("div");
  previewActions.className = "preview-actions";

  const showingText = document.createElement("span");
  showingText.className = "placeholder-text";
  showingText.textContent = t("results.showingRows", { shown, total: rows.length });
  previewActions.appendChild(showingText);

  if (rows.length > PREVIEW_ROW_LIMIT) {
    const viewAllBtn = document.createElement("button");
    viewAllBtn.type = "button";
    viewAllBtn.className = "btn-secondary";
    viewAllBtn.textContent = t("results.viewAllRows", { count: rows.length });
    viewAllBtn.addEventListener("click", () => {
      // Same clean row objects used by TSV output — no second transformed
      // copy of the clean dataset is created for this view. The modal is
      // explicitly tied to this group's identity (section 12) so it can be
      // force-closed from outside when this group stops being the active one.
      openViewAllRowsModal(
        { groupKey, profile: group.profile, date: group.date, bucket: group.bucket, rows },
        decimalSeparator,
        viewAllBtn
      );
    });
    previewActions.appendChild(viewAllBtn);
  }

  wrap.appendChild(previewActions);

  const table = document.createElement("table");
  table.className = "summary-table preview-table";

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
  rows.slice(0, PREVIEW_ROW_LIMIT).forEach((row) => {
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
  container.appendChild(wrap);
  attachTableScrollIndicators(wrap);
}

function formatGradeKey(decimalSeparator) {
  return (key) => {
    const numericGrade = extractNumericGrade(key);
    return numericGrade === null ? key : formatDecimal(numericGrade, decimalSeparator);
  };
}

function sanitizeForId(key) {
  return key.replace(/[^a-zA-Z0-9_-]/g, "-");
}

// Cleaning Group Selector (UI-5B §8) — rendered only when a profile has 2+
// groups; a single-group profile shows its one group directly with no
// selector, avoiding wasted screen space (§8/§20). Each item is a plain,
// independently focusable button (not a roving-tabindex tablist — group
// *selection* is not the same interaction as the Summary/Validation/Clean
// Data section tabs below, which do use the ARIA tabs pattern per §11).
// Every count/status shown here is read from the same readiness/validation
// authority as everywhere else — no independent computation.
function renderGroupSelector(groups, activeGroupKey, onSelectGroup) {
  const nav = document.createElement("div");
  nav.className = "group-selector";
  // role="group" (not "list"/"listitem") — its children are interactive
  // <button> elements, and a list/listitem pairing would override their
  // implicit button semantics, making them read as inert list entries
  // instead of the independently focusable buttons described above.
  nav.setAttribute("role", "group");
  nav.setAttribute("aria-label", t("profile.groupSelectorLabel"));

  groups.forEach((group) => {
    const groupKey = getGroupKey(group);
    const isActive = groupKey === activeGroupKey;
    const effectiveValidation = getEffectiveValidation(group);
    const readiness = computeGroupReadiness(effectiveValidation);

    const item = document.createElement("button");
    item.type = "button";
    item.className = isActive ? "group-selector-item group-selector-item-active" : "group-selector-item";
    item.setAttribute("aria-current", String(isActive));
    item.addEventListener("click", () => onSelectGroup(groupKey));

    const dateEl = document.createElement("span");
    dateEl.className = "group-selector-date";
    dateEl.textContent = group.date;
    item.appendChild(dateEl);

    const shiftEl = document.createElement("span");
    shiftEl.className = "group-selector-shift";
    shiftEl.textContent = bucketLabel(group.bucket);
    item.appendChild(shiftEl);

    const rowsEl = document.createElement("span");
    rowsEl.className = "group-selector-rows";
    rowsEl.textContent = t("profile.rowsCount", { count: group.rows.length });
    item.appendChild(rowsEl);

    item.appendChild(createStatusBadge(readiness.status));

    if (readiness.blockingCount > 0) {
      const issuesEl = document.createElement("span");
      issuesEl.className = "group-selector-issues";
      issuesEl.textContent = t("profile.issuesCount", { count: readiness.blockingCount });
      item.appendChild(issuesEl);
    } else if (effectiveValidation.shiftWarningCount > 0) {
      const issuesEl = document.createElement("span");
      issuesEl.className = "group-selector-issues";
      issuesEl.textContent = t("profile.timestampNoteCount", { count: effectiveValidation.shiftWarningCount });
      item.appendChild(issuesEl);
    }

    nav.appendChild(item);
  });

  return nav;
}

// Selected Group Header (UI-5B §10) — always visible for the active group
// regardless of which of the three sections below is open (§21: blocking
// readiness/status must never be hidden by section navigation). Profile,
// Date, Declared Shift, readiness, blocking/information summary, and
// headline row/tonnage/difference metrics — every value read from the same
// effective validation/readiness objects used everywhere else.
function buildSelectedGroupHeader(group, readiness, effectiveValidation, decimalSeparator) {
  const wrap = document.createElement("div");
  wrap.className = "selected-group-header";

  const top = document.createElement("div");
  top.className = "selected-group-header-top";

  const title = document.createElement("span");
  title.className = "selected-group-header-title";
  title.textContent = `${group.profile} · ${group.date} · ${bucketLabel(group.bucket)}`;
  top.appendChild(title);

  // The larger .status-badge--prominent form (UI-4 foundation primitive) —
  // reuses the same shared readiness color mapping as every other status
  // element in the app (group-status-presentation.js), just sized for this
  // header instead of the compact chip/tab-badge size.
  top.appendChild(createStatusBadge(readiness.status, "status-badge--prominent"));

  wrap.appendChild(top);

  const detailText = buildHeaderDetailText(effectiveValidation, readiness);
  if (detailText) {
    const detail = document.createElement("p");
    detail.className = "selected-group-header-detail";
    detail.textContent = detailText;
    wrap.appendChild(detail);
  }

  const metrics = document.createElement("div");
  metrics.className = "selected-group-header-metrics";

  const rowsMetric = document.createElement("span");
  rowsMetric.className = "selected-group-header-metric";
  rowsMetric.textContent = t("profile.rowsCount", { count: group.rows.length });
  metrics.appendChild(rowsMetric);

  const tonnageMetric = document.createElement("span");
  tonnageMetric.className = "selected-group-header-metric";
  tonnageMetric.textContent = t("profile.tonnageValue", {
    value: formatDecimal(effectiveValidation.cleanTonnage, decimalSeparator),
  });
  metrics.appendChild(tonnageMetric);

  const differenceMetric = document.createElement("span");
  differenceMetric.className = "selected-group-header-metric";
  differenceMetric.textContent = t("profile.differenceValue", {
    value: formatDecimal(effectiveValidation.tonnageDifference, decimalSeparator),
  });
  metrics.appendChild(differenceMetric);

  wrap.appendChild(metrics);

  return wrap;
}

// Compact group context (UI-5B navigation correction §10) — Profile · Date
// · Declared Shift, plus the compact readiness badge — shown alongside the
// sticky section tabs so identity/readiness stay visible even once the
// large Selected Group Header above (which never sticks, §9) has scrolled
// out of view. Same profile/date/shift/status values as
// buildSelectedGroupHeader, just the compact badge size.
function buildGroupSectionContext(group, readiness) {
  const wrap = document.createElement("div");
  wrap.className = "group-section-context";

  const title = document.createElement("span");
  title.className = "group-section-context-title";
  title.textContent = `${group.profile} · ${group.date} · ${bucketLabel(group.bucket)}`;
  wrap.appendChild(title);

  wrap.appendChild(createStatusBadge(readiness.status));

  return wrap;
}

// The three primary Cleaning Group sections (§11) — standard ARIA tabs
// pattern (role=tablist/tab, aria-selected, aria-controls, roving
// tabindex). Rendered into the sticky companion bar built by
// renderSelectedGroup below (UI-5B navigation correction §8), not directly
// into the group container. Switching sections is presentation-only: it
// never changes group selection, re-cleans, or resets approvals (§11).
function renderSectionTabs(container, groupKey, activeSection, onSelectSection) {
  const nav = document.createElement("div");
  nav.className = "group-section-tabs";
  nav.setAttribute("role", "tablist");
  nav.setAttribute("aria-label", t("profile.sectionTablistLabel"));

  const safeKey = sanitizeForId(groupKey);
  const panelId = `group-section-panel-${safeKey}`;

  SECTION_ORDER.forEach((section) => {
    const isActive = section === activeSection;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = `group-section-tab-${safeKey}-${section}`;
    btn.className = isActive ? "group-section-tab-btn group-section-tab-btn-active" : "group-section-tab-btn";
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(isActive));
    btn.setAttribute("aria-controls", panelId);
    btn.tabIndex = isActive ? 0 : -1;
    btn.textContent = t(SECTION_LABEL_KEY[section]);
    btn.addEventListener("click", () => onSelectSection(section));
    nav.appendChild(btn);
  });

  nav.addEventListener("keydown", (event) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    if (!event.target.closest(".group-section-tab-btn")) return;
    event.preventDefault();

    const currentIndex = SECTION_ORDER.indexOf(activeSection);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % SECTION_ORDER.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + SECTION_ORDER.length) % SECTION_ORDER.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = SECTION_ORDER.length - 1;

    onSelectSection(SECTION_ORDER[nextIndex]);
  });

  container.appendChild(nav);
  return panelId;
}

// Summary section (§12): headline metrics, existing Main/Operational
// Summary, and the collapsible Additional Breakdown — no calculation
// changes, no detailed validation panels duplicated here.
function renderSummarySection(container, group, effectiveValidation, readiness, decimalSeparator) {
  renderHeadlineMetrics(container, effectiveValidation, decimalSeparator, readiness);

  const operationalHeading = document.createElement("h4");
  operationalHeading.textContent = t("profile.mainSummary");
  container.appendChild(operationalHeading);
  renderOperationalSummary(container, group.summary.operational, decimalSeparator);

  const detailDetails = document.createElement("details");
  detailDetails.className = "additional-breakdown-details";
  const detailSummary = document.createElement("summary");
  detailSummary.textContent = t("profile.additionalBreakdown");
  detailDetails.appendChild(detailSummary);
  renderSummaryTable(detailDetails, t("profile.byContractor"), group.summary.byContractor, decimalSeparator);
  renderSummaryTable(detailDetails, t("profile.byPileId"), group.summary.byPileId, decimalSeparator);
  renderSummaryTable(detailDetails, t("profile.bySource"), group.summary.bySource, decimalSeparator);
  renderSummaryTable(
    detailDetails,
    t("profile.byGrade"),
    group.summary.byGrade,
    decimalSeparator,
    formatGradeKey(decimalSeparator)
  );
  container.appendChild(detailDetails);
}

// Validation & Issues section (§13): UI-5B only establishes this section and
// organizes existing content into it — no calculation, classification, or
// exception-workflow redesign (that is UI-5C). Every existing panel is
// preserved exactly, only relocated.
function renderValidationIssuesSection(
  container,
  group,
  groupKey,
  effectiveValidation,
  readiness,
  decimalSeparator,
  onWeightExceptionChanged,
  onLowNetExceptionChanged,
  listDtEndpoint,
  onRecleanRequested
) {
  const validationHeading = document.createElement("h4");
  validationHeading.textContent = t("validation.title");
  container.appendChild(validationHeading);
  renderDetailedMetrics(container, effectiveValidation, decimalSeparator, group.profile);

  renderShiftWarningRows(container, group);

  // Unmatched DT / New Unit contextual correction (UI-5C, design spec §12)
  // — lives directly in this Cleaning Group's Validation & Issues, replacing
  // both the old read-only "Unmatched DT Rows" table and the centralized,
  // all-groups-combined correction section formerly on the legacy Results
  // Overview tab. A dedicated container is used (rather than rendering
  // straight into `container`) since this panel redraws itself in place on
  // Save, independent of this section's own full re-render.
  const dtCorrectionContainer = document.createElement("div");
  container.appendChild(dtCorrectionContainer);
  renderDtCorrectionPanel(dtCorrectionContainer, group, groupKey, { listDtEndpoint, onRecleanRequested });

  renderWeightIntegrityIssues(
    container,
    group,
    decimalSeparator,
    groupKey,
    effectiveValidation,
    onWeightExceptionChanged
  );
  renderLowNetWeightIssues(
    container,
    group,
    decimalSeparator,
    groupKey,
    effectiveValidation,
    onLowNetExceptionChanged
  );
  renderOtherBlockingIssues(container, readiness);
}

// Clean Data section (§14): the exact existing preview + View All Rows
// control, moved into its own dedicated section — no second transformed
// dataset.
function renderCleanDataSection(container, group, groupKey, decimalSeparator) {
  renderPreview(container, group, groupKey, decimalSeparator);
}

// Renders the selected Cleaning Group's active section only — the other two
// sections' DOM is never built while inactive, matching the existing
// "no hidden-but-present DOM to go stale" guarantee used elsewhere in this
// file. Copying happens from the sticky bottom action bar's "Copy This
// Profile" / "Copy All Groups" buttons, gated by per-group readiness
// computed in result-page.js — no per-group copy button here.
function renderSelectedGroup(
  container,
  group,
  decimalSeparator,
  {
    activeSection,
    onSelectSection,
    onWeightExceptionChanged,
    onLowNetExceptionChanged,
    listDtEndpoint,
    onRecleanRequested,
  }
) {
  const groupKey = getGroupKey(group);
  // Approval-adjusted validation (v1.2.0) — the single object used for
  // every readiness/count/label decision below, so the header, Summary,
  // and Validation & Issues sections can never disagree about which
  // mismatches are still unresolved (see js/ui/group-readiness.js).
  const effectiveValidation = getEffectiveValidation(group);
  const readiness = computeGroupReadiness(effectiveValidation);

  // The large header never sticks (UI-5B navigation correction §9) — it is
  // appended in normal flow, same as before this correction.
  container.appendChild(buildSelectedGroupHeader(group, readiness, effectiveValidation, decimalSeparator));

  const resolvedSection = SECTION_ORDER.includes(activeSection) ? activeSection : GROUP_SECTION.SUMMARY;

  // Sticky companion bar (§8/§10): compact group context + the section
  // tabs, positioned below the app nav's own measured height like every
  // other sticky layer (see css/app.css .group-section-sticky-bar).
  const stickyBar = document.createElement("div");
  stickyBar.className = "group-section-sticky-bar";
  stickyBar.appendChild(buildGroupSectionContext(group, readiness));
  const panelId = renderSectionTabs(stickyBar, groupKey, resolvedSection, onSelectSection);
  container.appendChild(stickyBar);

  const panel = document.createElement("div");
  panel.className = "group-section-panel";
  panel.id = panelId;
  panel.setAttribute("role", "tabpanel");
  panel.setAttribute("aria-labelledby", `group-section-tab-${sanitizeForId(groupKey)}-${resolvedSection}`);

  if (resolvedSection === GROUP_SECTION.VALIDATION) {
    renderValidationIssuesSection(
      panel,
      group,
      groupKey,
      effectiveValidation,
      readiness,
      decimalSeparator,
      onWeightExceptionChanged,
      onLowNetExceptionChanged,
      listDtEndpoint,
      onRecleanRequested
    );
  } else if (resolvedSection === GROUP_SECTION.CLEAN_DATA) {
    renderCleanDataSection(panel, group, groupKey, decimalSeparator);
  } else {
    renderSummarySection(panel, group, effectiveValidation, readiness, decimalSeparator);
  }

  container.appendChild(panel);

  // UI-6B dock-overlap fix: an auto-expanded blocking panel (Unmatched DT,
  // Weight Integrity, Net Below Threshold, or Other Blocking Issues — all
  // share .blocking-issues-details) can render with its first row already
  // under the fixed bottom dock's covered band before the operator ever
  // scrolls. The target is that first row (or the summary heading, for a
  // panel whose body has no table) rather than the whole, often very tall,
  // <details> — scrolling the full element lets its far-off bottom edge
  // win the browser's "nearest edge" choice, which pulls the view *past*
  // the very rows this is meant to reveal. "nearest" is a no-op once the
  // target is already visible, so this never fights normal scrolling or a
  // re-render after a DT correction Save; the target's own
  // scroll-margin-bottom (css/app.css) gives that scroll real clearance
  // above the dock rather than stopping flush underneath it.
  if (resolvedSection === GROUP_SECTION.VALIDATION) {
    const firstBlockingPanel = panel.querySelector(".blocking-issues-details");
    if (firstBlockingPanel) {
      const scrollTarget =
        firstBlockingPanel.querySelector(".blocking-issues-body tbody tr:first-child") ||
        firstBlockingPanel.querySelector("summary");
      if (scrollTarget) {
        scrollTarget.scrollIntoView({ block: "nearest" });
      }
    }
  }
}

// activeGroupKey / onSelectGroup and activeSection / onSelectSection
// implement the Cleaning Group Selector (§8) and the three-section
// sub-navigation (§11), both owned by the caller (result-page.js), which is
// also responsible for resetting/defaulting this state on profile change,
// Refresh Cleaning, and Clear/Reset (section 14 of the original UI-5A
// spec, carried forward unchanged).
export function renderProfilePage(
  container,
  groups,
  decimalSeparator = ".",
  {
    activeGroupKey = null,
    activeSection = GROUP_SECTION.SUMMARY,
    onSelectGroup = () => {},
    onSelectSection = () => {},
    onWeightExceptionChanged = () => {},
    // Defaults to the same callback as weight exceptions (both just need
    // "re-render the panel + refresh action bar readiness") — a caller
    // that only ever passed onWeightExceptionChanged still gets correct
    // low-net resolution re-rendering with no call-site changes required.
    onLowNetExceptionChanged = onWeightExceptionChanged,
    listDtEndpoint,
    onRecleanRequested = () => {},
  } = {}
) {
  resetScrollCleanups();
  container.innerHTML = "";

  if (!groups.length) {
    renderProfilePagePlaceholder(container);
    return;
  }

  const selectedGroup = groups.find((group) => getGroupKey(group) === activeGroupKey) || groups[0];
  const selectedGroupKey = getGroupKey(selectedGroup);

  if (groups.length > 1) {
    container.appendChild(renderGroupSelector(groups, selectedGroupKey, onSelectGroup));
  }

  renderSelectedGroup(container, selectedGroup, decimalSeparator, {
    activeSection,
    onSelectSection,
    onWeightExceptionChanged,
    onLowNetExceptionChanged,
    listDtEndpoint,
    onRecleanRequested,
  });
}
