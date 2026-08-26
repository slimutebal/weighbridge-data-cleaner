// Shared, presentation-only readiness/status text and label mappings (UI-5B
// §7). Extracted out of profile-page.js so Page 1's Cleaning Overview
// (cleaning-overview-page.js) no longer imports from the Results renderer —
// both modules import this small shared module instead. Nothing here
// computes readiness or validation; every function is a pure display-text
// derivation over an already-computed validation/readiness object (see
// js/core/readiness.js, js/ui/group-readiness.js).
import { READINESS } from "../core/readiness.js";
import { t } from "./i18n.js";

// Display-only remapping of the core readiness enum to translation keys —
// one wording per readiness status across the whole app, never a second
// decision (result-page.js tab badges, cleaning-overview-page.js status
// badges, profile-page.js group selector/header all share this).
export const READINESS_SHORT_KEY = {
  [READINESS.READY]: "readiness.short.ready",
  [READINESS.READY_WITH_INFO]: "readiness.short.readyInfo",
  [READINESS.ACTION_REQUIRED]: "readiness.short.actionRequired",
  [READINESS.FAILED]: "readiness.short.failed",
};

// .status-badge--* color modifier (css/app.css UI-4 foundation primitive).
export const STATUS_BADGE_CLASS = {
  [READINESS.READY]: "status-badge--ready",
  [READINESS.READY_WITH_INFO]: "status-badge--info",
  [READINESS.ACTION_REQUIRED]: "status-badge--action-required",
  [READINESS.FAILED]: "status-badge--failed",
};

export function readinessShortLabel(status) {
  return t(READINESS_SHORT_KEY[status]);
}

// "DS"/"NS" (the literal declared-bucket value stored on every group, D009)
// -> a translated human-readable shift label, matching the wording already
// used by js/ui/wrong-bucket-modal.js's SHIFT_LABEL_KEY. Presentation only —
// the underlying group.bucket value/comparisons are never touched.
const SHIFT_LABEL_KEY = { DS: "shift.day", NS: "shift.night" };

export function bucketLabel(bucket) {
  return t(SHIFT_LABEL_KEY[bucket] || bucket);
}

// Builds a status badge element (compact pill by default) reusing the one
// STATUS_BADGE_CLASS color mapping above — used by both Page 1's Cleaning
// Overview and Results' Cleaning Group Selector so the two surfaces never
// diverge on how a readiness status is painted.
export function createStatusBadge(status, sizeClass = "status-badge--compact") {
  const badge = document.createElement("span");
  badge.className = `status-badge ${sizeClass} ${STATUS_BADGE_CLASS[status]}`;
  badge.textContent = readinessShortLabel(status);
  return badge;
}

// Recommended order (section 8 of the original phase spec): unmatched DT,
// missing required fields, duplicate NO.NOTA, lost rows, then everything
// else. Presentation-only ordering of already-computed validation counts —
// no new validation logic.
export function buildBlockingSummaryText(validation) {
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

// Collapsed/compact status detail line shared by Page 1's Cleaning Overview
// group rows, the Results Cleaning Group Selector, and the Selected Group
// Header — one wording per readiness status, never a second decision.
export function buildHeaderDetailText(validation, readiness) {
  if (readiness.status === READINESS.READY_WITH_INFO) {
    return t("profile.timestampNoteCount", { count: validation.shiftWarningCount });
  }
  if (readiness.status === READINESS.ACTION_REQUIRED) {
    return buildBlockingSummaryText(validation);
  }
  return "";
}
