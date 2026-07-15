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
import {
  computeGroupReadiness,
  summarizeGroupReadiness as summarizeGroupReadinessCore,
} from "../core/readiness.js";

export function getEffectiveValidation(group) {
  return applyApprovalsToValidation(group.validation, getGroupKey(group));
}

export function getGroupReadiness(group) {
  return computeGroupReadiness(getEffectiveValidation(group));
}

export function summarizeGroupReadiness(groups) {
  return summarizeGroupReadinessCore(
    groups.map((group) => ({ ...group, validation: getEffectiveValidation(group) }))
  );
}
