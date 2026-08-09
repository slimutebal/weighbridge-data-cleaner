// Thin UI-layer adapter (v1.2.0) that applies the current session's
// approved weight exceptions (js/core/weight-exception-store.js) to a
// group's raw validation before handing it to the centralized readiness
// logic (js/core/readiness.js, which stays pure/session-unaware). Every
// call site that used to call computeGroupReadiness(group.validation) or
// summarizeGroupReadiness(groups) directly for a *rendered* group should
// go through here instead, so approval state is never read/ignored
// inconsistently across result-page.js / profile-page.js / overview-page.js.
import { getGroupKey } from "../core/group-key.js";
import { applyApprovalsToValidation } from "../core/weight-exception-store.js";
import { applyLowNetApprovalsToValidation } from "../core/low-net-weight-store.js";
import {
  computeGroupReadiness,
  summarizeGroupReadiness as summarizeGroupReadinessCore,
} from "../core/readiness.js";

// Chains both session-scoped approval stores (weight exceptions, D011;
// low-net exceptions, v1.3.0) over the group's raw validation, so every
// caller sees one single effective validation object and the Cleaning
// Status, Validation Report, collapsed-header substatus, and both issue
// panels can never disagree about what's still unresolved.
export function getEffectiveValidation(group) {
  const groupId = getGroupKey(group);
  const withWeightApprovals = applyApprovalsToValidation(group.validation, groupId);
  return applyLowNetApprovalsToValidation(withWeightApprovals, groupId);
}

export function getGroupReadiness(group) {
  return computeGroupReadiness(getEffectiveValidation(group));
}

export function summarizeGroupReadiness(groups) {
  return summarizeGroupReadinessCore(
    groups.map((group) => ({ ...group, validation: getEffectiveValidation(group) }))
  );
}
