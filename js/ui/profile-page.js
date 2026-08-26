import {
  formatFullDatetime,
  formatDecimal,
  formatOutputCell,
  extractNumericGrade,
} from "../core/output-formatter.js";
import { renderValidation } from "./validation-panel.js";
import { computeGroupReadiness, READINESS } from "../core/readiness.js";
import { getEffectiveValidation, summarizeGroupReadiness } from "./group-readiness.js";
import { WEIGHT_ISSUE_CODES, parseSourceRowId } from "../core/weight-integrity.js";
import { getApproval, revokeException } from "../core/weight-exception-store.js";
import { openWeightExceptionDialog } from "./weight-exception-dialog.js";
import { getLowNetApproval, revokeLowNetException } from "../core/low-net-weight-store.js";
import { openLowNetWeightDialog } from "./low-net-weight-dialog.js";
import { OUTPUT_COLUMN_ORDER } from "../core/tsv-exporter.js";
import { getGroupKey } from "../core/group-key.js";
import { openViewAllRowsModal } from "./view-all-modal.js";
import { t } from "./i18n.js";
import { attachScrollEdgeIndicators } from "./scroll-edge-indicators.js";
import { NUMERIC_OUTPUT_COLUMNS, TABLE_HEADER_NUMERIC_CLASS, TABLE_CELL_NUMERIC_CLASS } from "./table-utils.js";

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

// Maps the core readiness enum (js/core/readiness.js, untouched) to
// translation keys — display-only remapping, see result-page.js's matching
// READINESS_SHORT_KEY comment.
const READINESS_LABEL_KEY = {
  [READINESS.READY]: "readiness.ready",
  [READINESS.READY_WITH_INFO]: "readiness.readyInfo",
  [READINESS.ACTION_REQUIRED]: "readiness.actionRequired",
  [READINESS.FAILED]: "readiness.failed",
};

const READINESS_SHORT_KEY = {
  [READINESS.READY]: "readiness.short.ready",
  [READINESS.READY_WITH_INFO]: "readiness.short.readyInfo",
  [READINESS.ACTION_REQUIRED]: "readiness.short.actionRequired",
  [READINESS.FAILED]: "readiness.short.failed",
};

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

// Unmatched DT Rows is a blocking-issue panel: rendered only when there is
// at least one row to show, expanded by default (section 10).
function renderUnmatchedDt(container, group) {
  const rows = group.validation.unmatchedDtRows;
  if (!rows.length) return;

  const details = document.createElement("details");
  details.className = "blocking-issues-details";
  details.open = true;

  const summary = document.createElement("summary");
  summary.textContent = t("profile.unmatchedDtHeading", { count: rows.length });
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "blocking-issues-body";

  const note = document.createElement("p");
  note.className = "placeholder-text";
  note.textContent = t("profile.unmatchedDtNote", { files: group.sourceFiles.join(", ") });
  body.appendChild(note);

  const wrap = document.createElement("div");
  wrap.className = "summary-table-wrap";

  const table = document.createElement("table");
  table.className = "summary-table";

  const thead = document.createElement("thead");
  thead.innerHTML =
    "<tr><th>NO.NOTA</th><th>Raw NO. DT</th><th>Normalized</th><th>PILE ID</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    [
      String(row["NO.NOTA"]),
      String(row._rawDtId ?? ""),
      String(row["NO. DT"]),
      String(row["PILE ID"] ?? ""),
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

const STATUS_CLASS = {
  [READINESS.READY]: "cleaning-status-ready",
  [READINESS.READY_WITH_INFO]: "cleaning-status-info",
  [READINESS.ACTION_REQUIRED]: "cleaning-status-blocked",
  [READINESS.FAILED]: "cleaning-status-blocked",
};

const READINESS_CHIP_CLASS = {
  [READINESS.READY]: "group-chip-readiness-ready",
  [READINESS.READY_WITH_INFO]: "group-chip-readiness-info",
  [READINESS.ACTION_REQUIRED]: "group-chip-readiness-blocked",
  [READINESS.FAILED]: "group-chip-readiness-blocked",
};

function renderCleaningStatus(container, readiness) {
  const statusEl = document.createElement("div");
  statusEl.className = `cleaning-status ${STATUS_CLASS[readiness.status]}`;
  statusEl.textContent = t(READINESS_LABEL_KEY[readiness.status]);
  container.appendChild(statusEl);
}

// Recommended order (section 8): unmatched DT, missing required fields,
// duplicate NO.NOTA, lost rows, then everything else. Presentation-only
// ordering of already-computed validation counts — no new validation logic.
function buildBlockingSummaryText(validation) {
  const items = [];
  if (validation.weightIntegrityIssueCount > 0) {
    items.push(t("blockingSummary.weightIntegrity", { count: validation.weightIntegrityIssueCount }));
  }
  const unresolvedLowNetCount = validation.unresolvedLowNetCount ?? validation.lowNetWeightCount ?? 0;
  if (unresolvedLowNetCount > 0) {
    items.push(t("blockingSummary.lowNetWeight", { count: unresolvedLowNetCount }));
  }
  if (validation.unmatchedDtCount > 0) {
    items.push(t("blockingSummary.unmatchedDt", { count: validation.unmatchedDtCount }));
  }
  if (validation.missingSourceCount > 0) {
    items.push(t("blockingSummary.missingSource", { count: validation.missingSourceCount }));
  }
  if (validation.missingGradeCount > 0) {
    items.push(t("blockingSummary.missingGrade", { count: validation.missingGradeCount }));
  }
  if (validation.duplicateNotaCount > 0) {
    items.push(t("blockingSummary.duplicateNota", { count: validation.duplicateNotaCount }));
  }
  if (validation.lostRowCount > 0) {
    items.push(t("blockingSummary.lostRows", { count: validation.lostRowCount }));
  }
  if (validation.pileIdSourceConflictCount > 0) {
    items.push(
      t("blockingSummary.pileIdSourceConflict", { count: validation.pileIdSourceConflictCount })
    );
  }

  const shown = items.slice(0, 3);
  const remaining = items.length - shown.length;
  return remaining > 0
    ? `${shown.join(" | ")} | ${t("blockingSummary.more", { count: remaining })}`
    : shown.join(" | ");
}

export function buildHeaderDetailText(validation, readiness) {
  if (readiness.status === READINESS.READY_WITH_INFO) {
    return t("profile.timestampNoteCount", { count: validation.shiftWarningCount });
  }
  if (readiness.status === READINESS.ACTION_REQUIRED) {
    return buildBlockingSummaryText(validation);
  }
  return "";
}

// Collapsed group headers must carry enough information to review the group
// without opening it (section 7) — profile/date/bucket/rows/source, plus
// the same centralized readiness object used for the expanded Cleaning
// Status (section 8: never recomputed independently).
function buildGroupHeaderContent(group, readiness, effectiveValidation) {
  const wrap = document.createElement("span");
  wrap.className = "group-header-content";

  const summaryLine = document.createElement("span");
  summaryLine.className = "group-summary-line";
  summaryLine.appendChild(createChip(group.profile, "group-chip-profile"));
  summaryLine.appendChild(createChip(group.date, "group-chip-date"));
  summaryLine.appendChild(createChip(t("profile.bucketLabel", { bucket: group.bucket }), "group-chip-shift"));
  summaryLine.appendChild(createChip(t("profile.rowsCount", { count: group.rows.length })));
  summaryLine.appendChild(createChip(group.sourceFiles.join(", ")));
  summaryLine.appendChild(
    createChip(t(READINESS_SHORT_KEY[readiness.status]), READINESS_CHIP_CLASS[readiness.status])
  );
  wrap.appendChild(summaryLine);

  const detailText = buildHeaderDetailText(effectiveValidation, readiness);
  if (detailText) {
    const sub = document.createElement("span");
    sub.className = "group-header-substatus";
    sub.textContent = detailText;
    wrap.appendChild(sub);
  }

  return wrap;
}

// Renders sections 2-10 of the agreed internal layout. Called only for the
// single active group — collapsed groups never get this body constructed
// at all, which is what guarantees no orphaned/stale detail can appear
// (section 3, 13): there is no hidden-but-present DOM to go stale.
function renderGroupBody(
  body,
  group,
  groupKey,
  readiness,
  decimalSeparator,
  effectiveValidation,
  onWeightExceptionChanged,
  onLowNetExceptionChanged
) {
  // 2. Cleaning Status
  renderCleaningStatus(body, readiness);

  // 3. Validation Report
  const validationHeading = document.createElement("h4");
  validationHeading.textContent = t("validation.title");
  body.appendChild(validationHeading);
  renderValidation(body, effectiveValidation, decimalSeparator, group.profile, readiness);

  // 4. Main Summary
  const operationalHeading = document.createElement("h4");
  operationalHeading.textContent = t("profile.mainSummary");
  body.appendChild(operationalHeading);
  renderOperationalSummary(body, group.summary.operational, decimalSeparator);

  // 5. Additional Breakdown — collapsed by default
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
  body.appendChild(detailDetails);

  // 6. Timestamp Window Notes — conditional, collapsed by default
  renderShiftWarningRows(body, group);

  // 7. Unmatched DT Rows — conditional, expanded by default
  renderUnmatchedDt(body, group);

  // 7b. Weight Integrity Issues (v1.1.0 D010, resolution workflow v1.2.0
  // D011) — conditional, placed after Unmatched DT Rows and before Other
  // Blocking Issues (§10 of the original spec / §3 of the v1.2.0 spec).
  renderWeightIntegrityIssues(body, group, decimalSeparator, groupKey, effectiveValidation, onWeightExceptionChanged);

  // 7c. Low Net Weight Confirmation (v1.3.0) — conditional, placed after
  // Weight Integrity Issues and before Other Blocking Issues (phase
  // spec §9).
  renderLowNetWeightIssues(body, group, decimalSeparator, groupKey, effectiveValidation, onLowNetExceptionChanged);

  // 8. Other Blocking Issues — conditional, expanded by default
  renderOtherBlockingIssues(body, readiness);

  // 9-10. Clean Data Preview + View All Rows control
  renderPreview(body, group, groupKey, decimalSeparator);

  // Copying happens from the sticky bottom action bar's "Copy This Profile"
  // / "Copy All Groups" buttons, gated by per-group readiness computed in
  // result-page.js — no per-group copy button here, avoiding a duplicate/
  // confusing control with a different, narrower scope.
}

function sanitizeForId(key) {
  return key.replace(/[^a-zA-Z0-9_-]/g, "-");
}

// isToggleable = false is used only for the single-group-per-profile case
// (section 4): that group is always open and has nothing to collapse into,
// so its header is a static (non-interactive) label rather than a button
// that would do nothing when clicked.
function renderGroupCard(
  group,
  decimalSeparator,
  { isOpen, isToggleable, onToggle, onWeightExceptionChanged, onLowNetExceptionChanged }
) {
  const groupKey = getGroupKey(group);
  // Approval-adjusted validation (v1.2.0) — the single object used for
  // every readiness/count/label decision below, so the Cleaning Status,
  // Validation Report, collapsed-header substatus, and the Weight
  // Integrity Issues panel itself can never disagree about which
  // mismatches are still unresolved (see js/ui/group-readiness.js).
  const effectiveValidation = getEffectiveValidation(group);
  const readiness = computeGroupReadiness(effectiveValidation);
  const bodyId = `group-body-${sanitizeForId(groupKey)}`;

  const card = document.createElement("div");
  card.className = "group-card";

  let headerEl;
  if (isToggleable) {
    headerEl = document.createElement("button");
    headerEl.type = "button";
    headerEl.className = "group-header-btn";
    headerEl.setAttribute("aria-expanded", String(isOpen));
    headerEl.setAttribute("aria-controls", bodyId);
    headerEl.addEventListener("click", () => onToggle(groupKey));

    const icon = document.createElement("span");
    icon.className = "group-toggle-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = isOpen ? "▼" : "▶";
    headerEl.appendChild(icon);
  } else {
    headerEl = document.createElement("div");
    headerEl.className = "group-header-btn group-header-static";
  }

  headerEl.appendChild(buildGroupHeaderContent(group, readiness, effectiveValidation));
  card.appendChild(headerEl);

  if (isOpen) {
    const body = document.createElement("div");
    body.className = "group-details-body";
    body.id = bodyId;
    renderGroupBody(
      body,
      group,
      groupKey,
      readiness,
      decimalSeparator,
      effectiveValidation,
      onWeightExceptionChanged,
      onLowNetExceptionChanged
    );
    card.appendChild(body);
  }

  return card;
}

// Compact operational summary shown above the group list only when a
// profile has 2+ groups (section 5) — never a substitute for the full
// per-group Validation Report, and hidden entirely for single-group
// profiles to avoid redundant clutter (section 4/16, Scenario G).
function renderProfileSummary(groups) {
  const summary = summarizeGroupReadiness(groups);
  const wrap = document.createElement("div");
  wrap.className = "profile-summary";

  const heading = document.createElement("h3");
  heading.textContent = t("profile.summaryHeading", { profile: groups[0].profile });
  wrap.appendChild(heading);

  const line1 = document.createElement("p");
  line1.className = "profile-summary-line";
  line1.textContent = t("profile.summaryGroupsRows", {
    groups: summary.totalGroups,
    rows: summary.totalRows,
  });
  wrap.appendChild(line1);

  const line2 = document.createElement("p");
  line2.className = "profile-summary-line";
  line2.textContent = t("profile.summaryStatusLine", {
    ready: summary.readyCount,
    readyInfo: summary.readyWithInfoCount,
    actionRequired: summary.actionRequiredCount,
    failed: summary.failedCount,
  });
  wrap.appendChild(line2);

  return wrap;
}

// activeGroupKey / onToggleGroup implement single-open accordion state
// (section 9) owned by the caller (result-page.js), which is also
// responsible for resetting this state on profile change, Refresh
// Cleaning, and Clear/Reset (section 14).
export function renderProfilePage(
  container,
  groups,
  decimalSeparator = ".",
  {
    activeGroupKey = null,
    onToggleGroup = () => {},
    onWeightExceptionChanged = () => {},
    // Defaults to the same callback as weight exceptions (both just need
    // "re-render the panel + refresh action bar readiness") — a caller
    // that only ever passed onWeightExceptionChanged still gets correct
    // low-net resolution re-rendering with no call-site changes required.
    onLowNetExceptionChanged = onWeightExceptionChanged,
  } = {}
) {
  resetScrollCleanups();
  container.innerHTML = "";

  if (!groups.length) {
    renderProfilePagePlaceholder(container);
    return;
  }

  if (groups.length === 1) {
    container.appendChild(
      renderGroupCard(groups[0], decimalSeparator, {
        isOpen: true,
        isToggleable: false,
        onToggle: onToggleGroup,
        onWeightExceptionChanged,
        onLowNetExceptionChanged,
      })
    );
    return;
  }

  container.appendChild(renderProfileSummary(groups));

  groups.forEach((group) => {
    const isOpen = getGroupKey(group) === activeGroupKey;
    container.appendChild(
      renderGroupCard(group, decimalSeparator, {
        isOpen,
        isToggleable: true,
        onToggle: onToggleGroup,
        onWeightExceptionChanged,
        onLowNetExceptionChanged,
      })
    );
  });
}
