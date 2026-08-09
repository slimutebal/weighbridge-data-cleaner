// Session-scoped approved low-net-weight exception store (v1.3.0),
// mirroring js/core/weight-exception-store.js's model (DECISIONS.md
// D011) for LOW_NET_WEIGHT rows. Operator declaration only: this never
// modifies Recorded Net and never deletes the underlying low-net finding
// — it only records that a human confirmed the recorded raw Net may
// continue to be used for a specific source row, and derives an
// operational (not mathematical) resolution state from that record.
//
// State lives at module scope, exactly like weight-exception-store.js —
// a plain in-memory store, reset via an explicit call rather than a
// framework lifecycle. startNewRun() must be called by every path that
// replaces or clears cleaning results (js/ui/result-page.js's
// reset()/showGroups()) so an approval can never survive a Refresh
// Cleaning, Clear/Reset, or new upload's result set (phase spec §14).
// Kept as its own independent run counter (not shared with
// weight-exception-store.js) — both stores are started together by every
// caller, but neither needs to know about the other's internal id.

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

// Binds an approval to the exact run, group, source row, and Recorded
// Net value it was granted for (§14) — not filename/row-number/NO.NOTA
// alone. A row whose Recorded Net changes (re-uploaded corrected source,
// or a different cleaning run) produces a different key and therefore
// never matches a stale approval; that row correctly reverts to
// unresolved without any extra invalidation logic (§15 test L).
function buildApprovalKey({ groupId, sourceRowId, recordedNetMinorUnits }) {
  return [currentRunId, groupId, sourceRowId, recordedNetMinorUnits].join("::");
}

// `record` is the full approved-exception structure (§13 of the phase
// spec): groupId/sourceRowId/recordedNetMinorUnits (the key fields) plus
// every other audit field (sourceFilename, worksheetName,
// sourceRowNumber, profile, thresholdMinorUnits, thresholdTonnes,
// confirmedBy, confirmationReference, notes, confirmedAt). Never mutates
// the record passed in; stores a shallow copy with the derived
// key/runId/status.
export function approveLowNetException(record) {
  const key = buildApprovalKey(record);
  approvals.set(key, {
    ...record,
    runId: currentRunId,
    issueCode: "LOW_NET_WEIGHT",
    status: "APPROVED_LOW_NET",
  });
  return key;
}

export function revokeLowNetException(keyFields) {
  approvals.delete(buildApprovalKey(keyFields));
}

export function getLowNetApproval(keyFields) {
  return approvals.get(buildApprovalKey(keyFields)) || null;
}

export function getLowNetApprovalsForGroup(groupId) {
  return Array.from(approvals.values()).filter((entry) => entry.groupId === groupId);
}

// Derives the three operator-facing counts (§16) from a group's raw
// validation (js/core/validation-engine.js, unchanged) plus this store's
// current approvals — never mutates or recomputes the underlying
// low-net finding. `lowNetWeightCount` (the raw total) is untouched;
// only the unresolved/approved split is derived here.
export function applyLowNetApprovalsToValidation(validation, groupId) {
  const lowNetRows = validation.lowNetWeightRows || [];
  const approvedCount = lowNetRows.filter((row) => {
    const lnw = row._lowNetWeight;
    return Boolean(
      getLowNetApproval({
        groupId,
        sourceRowId: lnw.sourceRowId,
        recordedNetMinorUnits: lnw.recordedNetMinorUnits,
      })
    );
  }).length;

  const totalLowNetCount = validation.lowNetWeightCount || 0;
  const unresolvedLowNetCount = totalLowNetCount - approvedCount;

  return {
    ...validation,
    totalLowNetCount,
    unresolvedLowNetCount,
    approvedLowNetExceptionCount: approvedCount,
  };
}
