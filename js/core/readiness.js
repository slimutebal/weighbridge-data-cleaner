// Centralized copy-readiness computation for one cleaning group. Reads
// only fields already produced by computeGroupValidation() (validation-
// engine.js) — it does not compute any new validation, only classifies
// existing counts into "blocking" vs "informational".

export const READINESS = {
  READY: "READY",
  READY_WITH_INFO: "READY_WITH_INFO",
  ACTION_REQUIRED: "ACTION_REQUIRED",
  // No group object currently represents a cleaning failure — a file that
  // fails to clean never enters groupMap in cleaning-orchestrator.js, it is
  // reported at the top level via fileErrors instead. FAILED is defined
  // here (and mapped in the priority/label tables below) so group-level UI
  // that already switches on READINESS is complete and correct if a future
  // phase ever attaches a failure state to a group; nothing in this patch
  // produces it today.
  FAILED: "FAILED",
};

const READINESS_LABEL = {
  [READINESS.READY]: "Ready to Copy",
  [READINESS.READY_WITH_INFO]: "Ready to Copy — Information Available",
  [READINESS.ACTION_REQUIRED]: "Action Required — Copy Disabled",
  [READINESS.FAILED]: "Cleaning Failed",
};

// FAILED > ACTION_REQUIRED > READY_WITH_INFO > READY (highest severity first).
export const READINESS_PRIORITY = [
  READINESS.FAILED,
  READINESS.ACTION_REQUIRED,
  READINESS.READY_WITH_INFO,
  READINESS.READY,
];

// "Other Blocking Issues" categories: every currently-computed validation
// metric that is not already its own dedicated section (Unmatched DT Rows
// has its own panel; Timestamp Window Notes is informational, never
// blocking). Categories not yet computed anywhere in validation-engine.js
// (e.g. missing PILE ID, invalid Net, tonnage integrity) are intentionally
// not included here — this patch does not add new validation logic.
export function computeOtherBlockingIssues(validation) {
  const categories = [];

  if (validation.missingSourceCount > 0) {
    categories.push({
      key: "missingSource",
      label: "Missing Source",
      count: validation.missingSourceCount,
      rows: validation.missingSourceRows,
    });
  }
  if (validation.missingGradeCount > 0) {
    categories.push({
      key: "missingGrade",
      label: "Missing Grade",
      count: validation.missingGradeCount,
      rows: validation.missingGradeRows,
    });
  }
  if (validation.duplicateNotaCount > 0) {
    categories.push({
      key: "duplicateNota",
      label: "Duplicate NO.NOTA",
      count: validation.duplicateNotaCount,
      rows: validation.duplicateNotaRows,
    });
  }
  if (validation.pileIdSourceConflictCount > 0) {
    categories.push({
      key: "pileIdSourceConflict",
      label: "PILE ID / Source Conflicts",
      count: validation.pileIdSourceConflictCount,
      rows: validation.pileIdSourceConflictRows,
    });
  }
  if (validation.lostRowCount > 0) {
    categories.push({
      key: "lostRows",
      label: "Lost Rows",
      count: validation.lostRowCount,
      rows: null,
    });
  }

  return categories;
}

// Short form used on collapsed group headers, profile tab badges, and the
// profile-level summary — distinct from the longer copy-oriented
// READINESS_LABEL above, which is reserved for the Cleaning Status line
// inside an expanded group.
export const READINESS_SHORT_LABEL = {
  [READINESS.READY]: "Ready",
  [READINESS.READY_WITH_INFO]: "Ready with Information",
  [READINESS.ACTION_REQUIRED]: "Action Required",
  [READINESS.FAILED]: "Cleaning Failed",
};

export function computeGroupReadiness(validation) {
  const otherBlocking = computeOtherBlockingIssues(validation);
  const otherBlockingCount = otherBlocking.reduce((sum, category) => sum + category.count, 0);
  // Weight Integrity Issues (v1.1.0, D010) has its own dedicated report
  // section (js/ui/profile-page.js, between Unmatched DT Rows and Other
  // Blocking Issues) — kept as its own addend here for the same reason
  // unmatchedDtCount is: never folded into otherBlocking/otherBlockingCount,
  // which only covers categories rendered inside the generic Other Blocking
  // Issues panel.
  const weightIntegrityBlockingCount = validation.weightIntegrityIssueCount || 0;
  const blockingCount = validation.unmatchedDtCount + otherBlockingCount + weightIntegrityBlockingCount;

  // Approved weight exceptions (v1.2.0, D011) are informational, never
  // "fully clean" — a group with zero unresolved mismatches but one or
  // more approved exceptions must still surface as READY_WITH_INFO, not
  // plain READY, even when there is no shift-warning note. Additive: a
  // caller that never sets approvedWeightExceptionCount (v1.1.0 behavior)
  // sees this branch evaluate to the same result as before.
  let status = READINESS.READY;
  if (blockingCount > 0) {
    status = READINESS.ACTION_REQUIRED;
  } else if (validation.shiftWarningCount > 0 || (validation.approvedWeightExceptionCount || 0) > 0) {
    status = READINESS.READY_WITH_INFO;
  }

  return {
    status,
    label: READINESS_LABEL[status],
    blocking: status === READINESS.ACTION_REQUIRED,
    otherBlocking,
    otherBlockingCount,
    weightIntegrityBlockingCount,
    blockingCount,
  };
}

// Aggregates per-group readiness (each computed via computeGroupReadiness,
// never recomputed independently) into the compact profile-level summary
// (section 5) and profile-tab status badge (section 6). Purely an
// aggregation of existing per-group values — no new validation logic.
export function summarizeGroupReadiness(groups) {
  const counts = {
    [READINESS.READY]: 0,
    [READINESS.READY_WITH_INFO]: 0,
    [READINESS.ACTION_REQUIRED]: 0,
    [READINESS.FAILED]: 0,
  };

  let totalRows = 0;
  let totalInfoNotes = 0;
  let totalBlockingCount = 0;

  groups.forEach((group) => {
    const readiness = computeGroupReadiness(group.validation);
    counts[readiness.status] += 1;
    totalRows += group.rows.length;
    totalInfoNotes += group.validation.shiftWarningCount;
    totalBlockingCount += readiness.blockingCount;
  });

  const highestSeverity =
    READINESS_PRIORITY.find((status) => counts[status] > 0) || READINESS.READY;

  return {
    totalGroups: groups.length,
    totalRows,
    readyCount: counts[READINESS.READY],
    readyWithInfoCount: counts[READINESS.READY_WITH_INFO],
    actionRequiredCount: counts[READINESS.ACTION_REQUIRED],
    failedCount: counts[READINESS.FAILED],
    totalInfoNotes,
    totalBlockingCount,
    highestSeverity,
    highestSeverityLabel: READINESS_SHORT_LABEL[highestSeverity],
  };
}
