// Page 1 Cleaning Overview (UI-5A) — a decision/navigation surface, never
// the detailed Results workspace. Reuses the existing readiness/report
// authority exactly as overview-page.js and profile-page.js already do:
// no new validation, grouping, or readiness computation is introduced
// here. Each Cleaning Group (Profile + Date + Declared Bucket Shift) stays
// individually visible/selectable — profiles are never collapsed into one
// ambiguous status.
import { formatDecimal } from "../core/output-formatter.js";
import { READINESS, computeGroupReadiness } from "../core/readiness.js";
import { getGroupKey } from "../core/group-key.js";
import { getEffectiveValidation, summarizeGroupReadiness } from "./group-readiness.js";
import { buildHeaderDetailText } from "./profile-page.js";
import { t, subscribeLanguage } from "./i18n.js";
import { attachScrollEdgeIndicators } from "./scroll-edge-indicators.js";
import { TABLE_HEADER_NUMERIC_CLASS, TABLE_CELL_NUMERIC_CLASS } from "./table-utils.js";

const PROFILE_ORDER = ["HYNC", "SLNC", "ESG"];

const READINESS_SHORT_KEY = {
  [READINESS.READY]: "readiness.short.ready",
  [READINESS.READY_WITH_INFO]: "readiness.short.readyInfo",
  [READINESS.ACTION_REQUIRED]: "readiness.short.actionRequired",
  [READINESS.FAILED]: "readiness.short.failed",
};

const STATUS_BADGE_CLASS = {
  [READINESS.READY]: "status-badge--ready",
  [READINESS.READY_WITH_INFO]: "status-badge--info",
  [READINESS.ACTION_REQUIRED]: "status-badge--action-required",
  [READINESS.FAILED]: "status-badge--failed",
};

function createStatusBadge(status, sizeClass) {
  const badge = document.createElement("span");
  badge.className = `status-badge ${sizeClass} ${STATUS_BADGE_CLASS[status]}`;
  badge.textContent = t(READINESS_SHORT_KEY[status]);
  return badge;
}

function isBlockingStatus(status) {
  return status === READINESS.ACTION_REQUIRED || status === READINESS.FAILED;
}

export function mountCleaningOverviewPage(container, { onOpenGroup, decimalSeparator = "." } = {}) {
  let currentResult = { groups: [], fileErrors: [] };
  let processing = false;
  let currentDecimalSeparator = decimalSeparator === "," ? "," : ".";
  let scrollCleanups = [];

  function resetScrollCleanups() {
    scrollCleanups.forEach((cleanup) => cleanup());
    scrollCleanups = [];
  }

  function renderFileErrors() {
    const list = document.createElement("ul");
    list.className = "warning-list warning-list-error";
    currentResult.fileErrors.forEach((error) => {
      const li = document.createElement("li");
      li.textContent = `${error.fileName}: ${error.message}`;
      list.appendChild(li);
    });
    container.appendChild(list);
  }

  function renderGroupRow(profileId, group) {
    const effectiveValidation = getEffectiveValidation(group);
    const readiness = computeGroupReadiness(effectiveValidation);

    const tr = document.createElement("tr");

    const dateTd = document.createElement("td");
    dateTd.textContent = group.date;
    tr.appendChild(dateTd);

    const bucketTd = document.createElement("td");
    bucketTd.textContent = group.bucket;
    tr.appendChild(bucketTd);

    const rowsTd = document.createElement("td");
    rowsTd.textContent = String(group.rows.length);
    rowsTd.classList.add(TABLE_CELL_NUMERIC_CLASS);
    tr.appendChild(rowsTd);

    const tonnageTd = document.createElement("td");
    tonnageTd.textContent = formatDecimal(group.validation.cleanTonnage, currentDecimalSeparator);
    tonnageTd.classList.add(TABLE_CELL_NUMERIC_CLASS);
    tr.appendChild(tonnageTd);

    const statusTd = document.createElement("td");
    statusTd.appendChild(createStatusBadge(readiness.status, "status-badge--compact"));
    const detailText = buildHeaderDetailText(effectiveValidation, readiness);
    if (detailText) {
      const sub = document.createElement("div");
      sub.className = "group-header-substatus";
      sub.textContent = detailText;
      statusTd.appendChild(sub);
    }
    tr.appendChild(statusTd);

    const actionTd = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    const blocking = isBlockingStatus(readiness.status);
    btn.className = blocking ? "btn-primary" : "btn-secondary";
    btn.textContent = blocking ? t("overview1.reviewIssues") : t("overview1.viewResults");
    btn.addEventListener("click", () => {
      if (onOpenGroup) onOpenGroup(profileId, getGroupKey(group));
    });
    actionTd.appendChild(btn);
    tr.appendChild(actionTd);

    return tr;
  }

  function renderProfileBlock(profileId, groups) {
    const summary = summarizeGroupReadiness(groups);

    const headerWrap = document.createElement("div");
    headerWrap.className = "profile-summary";

    const heading = document.createElement("h3");
    heading.textContent = profileId;
    headerWrap.appendChild(heading);

    const line1 = document.createElement("p");
    line1.className = "profile-summary-line";
    line1.textContent = t("profile.summaryGroupsRows", {
      groups: summary.totalGroups,
      rows: summary.totalRows,
    });
    headerWrap.appendChild(line1);

    const line2 = document.createElement("p");
    line2.className = "profile-summary-line overview1-highest-status-line";
    const label = document.createElement("span");
    label.textContent = t("overview1.highestStatusLabel");
    line2.appendChild(label);
    line2.appendChild(createStatusBadge(summary.highestSeverity, "status-badge--compact"));
    headerWrap.appendChild(line2);

    container.appendChild(headerWrap);

    const wrap = document.createElement("div");
    wrap.className = "summary-table-wrap";

    const table = document.createElement("table");
    table.className = "summary-table";

    const columns = [
      { key: "overview.date", numeric: false },
      { key: "overview.bucket", numeric: false },
      { key: "overview.rows", numeric: true },
      { key: "overview.netTonnage", numeric: true },
      { key: "overview.status", numeric: false },
      { key: "overview1.actionColumn", numeric: false },
    ];

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    columns.forEach(({ key, numeric }) => {
      const th = document.createElement("th");
      th.textContent = t(key);
      if (numeric) th.classList.add(TABLE_HEADER_NUMERIC_CLASS);
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    groups.forEach((group) => tbody.appendChild(renderGroupRow(profileId, group)));
    table.appendChild(tbody);

    wrap.appendChild(table);
    container.appendChild(wrap);
    scrollCleanups.push(attachScrollEdgeIndicators(wrap));
  }

  function render() {
    resetScrollCleanups();
    container.innerHTML = "";

    const heading = document.createElement("h2");
    heading.textContent = t("overview1.heading");
    container.appendChild(heading);

    if (processing) {
      const status = document.createElement("p");
      status.className = "placeholder-text";
      status.setAttribute("aria-live", "polite");
      status.textContent = t("overview1.processing");
      container.appendChild(status);
      return;
    }

    if (currentResult.fileErrors.length) {
      renderFileErrors();
    }

    if (!currentResult.groups.length) {
      const empty = document.createElement("p");
      empty.className = "placeholder-text";
      empty.textContent = currentResult.fileErrors.length
        ? t("results.noGroupsErrors")
        : t("overview1.emptyState");
      container.appendChild(empty);
      return;
    }

    PROFILE_ORDER.filter((profileId) =>
      currentResult.groups.some((group) => group.profile === profileId)
    ).forEach((profileId) => {
      const profileGroups = currentResult.groups.filter((group) => group.profile === profileId);
      renderProfileBlock(profileId, profileGroups);
    });
  }

  subscribeLanguage(render);
  render();

  return {
    showResult(result) {
      currentResult = { groups: result.groups || [], fileErrors: result.fileErrors || [] };
      processing = false;
      render();
    },
    setProcessing(isProcessing) {
      processing = Boolean(isProcessing);
      render();
    },
    setDecimalSeparator(value) {
      currentDecimalSeparator = value === "," ? "," : ".";
      render();
    },
    reset() {
      currentResult = { groups: [], fileErrors: [] };
      processing = false;
      render();
    },
  };
}
