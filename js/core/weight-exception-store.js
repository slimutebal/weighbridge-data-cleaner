// Session-scoped approved weight-exception store (v1.2.0). Operator
// declaration only — see DECISIONS.md D011: this never modifies Gross,
// Tare, or Recorded Net, and never deletes the underlying mathematical
// mismatch evidence. It only records that a human confirmed the recorded
// raw Net may continue to be used for a specific source row, and derives
// an operational (not mathematical) resolution state from that record.
//
// State lives at module scope, exactly like js/ui/overview-page.js's
// draftContractorInputs/dtCorrectionStatus pattern — a plain in-memory
// store, reset via an explicit call rather than a framework lifecycle.
// startNewRun() must be called by every path that replaces or clears
// cleaning results (js/ui/result-page.js's reset()/showGroups()) so an
// approval can never survive a Refresh Cleaning, Clear/Reset, or new
// upload's result set (§10 of the phase spec).

let currentRunId = 0;
let approvals = new Map();

export function startNewRun() {
  currentRunId += 1;
  approvals = new Map();
  return currentRunId;
}

export function getRunId() {
  return currentRunId;
}

// Binds an approval to the exact run, group, source row, and weight
// values it was granted for (§10) — not filename/row-number/NO.NOTA
// alone. A row whose Gross, Tare, or Recorded Net changes (re-uploaded
// corrected source, or a different cleaning run) produces a different
// key and therefore never matches a stale approval; that row correctly
// reverts to unresolved without any extra invalidation logic.
function buildApprovalKey({ groupId, sourceRowId, grossMinorUnits, tareMinorUnits, recordedNetMinorUnits }) {
  return [currentRunId, groupId, sourceRowId, grossMinorUnits, tareMinorUnits, recordedNetMinorUnits].join("::");
}

// `record` is the full approved-exception structure (§9 of the phase
// spec): groupId/sourceRowId/grossMinorUnits/tareMinorUnits/
// recordedNetMinorUnits (the key fields) plus every other audit field
// (sourceFilename, worksheetName, sourceRowNumber, profile,
// calculatedNetMinorUnits, differenceMinorUnits, confirmedBy,
// confirmationReference, notes, confirmedAt). Never mutates the record
// passed in; stores a shallow copy with the derived key/runId/status.
export function approveException(record) {
  const key = buildApprovalKey(record);
  approvals.set(key, {
    ...record,
    runId: currentRunId,
    issueCode: "WEIGHT_CALCULATION_MISMATCH",
    status: "APPROVED_RECORDED_NET",
  });
  return key;
}

export function revokeException(keyFields) {
  approvals.delete(buildApprovalKey(keyFields));
}

export function getApproval(keyFields) {
  return approvals.get(buildApprovalKey(keyFields)) || null;
}

export function getApprovalsForGroup(groupId) {
  return Array.from(approvals.values()).filter((entry) => entry.groupId === groupId);
}

// Derives the three operator-facing counts (§5, §12) from a group's raw
// validation (js/core/validation-engine.js, unchanged) plus this store's
// current approvals — never mutates or recomputes the underlying
// mathematical mismatch data. `weightIntegrityIssueCount` is reduced by
// exactly the approved count, since approvals only ever apply to
// WEIGHT_CALCULATION_MISMATCH rows (validation.weightMismatchRows) — every
// other weight issue type (invalid Gross/Tare/Recorded Net, negative
// weight, Gross below Tare) has no approval workflow and stays fully
// blocking, unaffected by this subtraction.
export function applyApprovalsToValidation(validation, groupId) {
  const mismatchRows = validation.weightMismatchRows || [];
  const approvedCount = mismatchRows.filter((row) => {
    const wi = row._weightIntegrity;
    return Boolean(
      getApproval({
        groupId,
        sourceRowId: wi.sourceRowId,
        grossMinorUnits: wi.grossMinorUnits,
        tareMinorUnits: wi.tareMinorUnits,
        recordedNetMinorUnits: wi.recordedNetMinorUnits,
      })
    );
  }).length;

  const totalWeightMismatchCount = validation.weightMismatchCount;
  const unresolvedWeightMismatchCount = totalWeightMismatchCount - approvedCount;

  return {
    ...validation,
    weightIntegrityIssueCount: validation.weightIntegrityIssueCount - approvedCount,
    totalWeightMismatchCount,
    unresolvedWeightMismatchCount,
    approvedWeightExceptionCount: approvedCount,
  };
}
