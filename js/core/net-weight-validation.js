// Low Net Weight Confirmation (v1.3.0). Pure, profile-agnostic core:
// HYNC/SLNC/ESG cleaners only ever supply the row's already-computed
// _weightIntegrity result and profile id — this module never re-parses
// the raw source cell itself, it reuses weight-integrity.js's already-
// parsed recordedNetMinorUnits so the low-net comparison and the weight-
// integrity comparison can never disagree about what "Recorded Net" was.
//
// Business rule (non-negotiable): this module only detects and reports
// Recorded Net below the configured minimum-tonnage threshold. It never
// modifies Recorded Net, and the clean output/TSV Net always stays the
// recorded source value. A confirmed-low row blocks copy until an
// operator resolves it via the low-net-weight exception workflow
// (js/core/low-net-weight-store.js), mirroring D010/D011's weight-
// exception model.

import { parseToMinorUnits, WEIGHT_ISSUE_CODES } from "./weight-integrity.js";

export const NET_WEIGHT_ISSUE_CODES = {
  LOW_NET_WEIGHT: "LOW_NET_WEIGHT",
};

export const NET_WEIGHT_ISSUE_SEVERITY = {
  [NET_WEIGHT_ISSUE_CODES.LOW_NET_WEIGHT]: "blocking",
};

// Weight-integrity issue codes that make the row's weight data generally
// untrustworthy (missing/unparseable Gross-Tare-Net, a negative parsed
// value, or Gross below Tare) — when the row already carries one of
// these, weight-integrity stays the sole authority and no LOW_NET_WEIGHT
// is added for the same underlying data problem (phase spec §5).
// WEIGHT_CALCULATION_MISMATCH is deliberately excluded: Recorded Net
// itself is still a parsed, trustworthy number in that case (it just
// doesn't match Gross - Tare), so it remains independently eligible for
// its own, unrelated low-net comparison.
const SUPPRESSING_WEIGHT_ISSUE_CODES = new Set([
  WEIGHT_ISSUE_CODES.INVALID_GROSS_WEIGHT,
  WEIGHT_ISSUE_CODES.INVALID_TARE_WEIGHT,
  WEIGHT_ISSUE_CODES.INVALID_RECORDED_NET_WEIGHT,
  WEIGHT_ISSUE_CODES.NEGATIVE_WEIGHT_VALUE,
  WEIGHT_ISSUE_CODES.GROSS_BELOW_TARE,
]);

// How many source units (of the profile's weightIntegrity sourceUnit)
// make up one tonne — HYNC/SLNC record Net in kg, ESG already in tonnes
// (LC-4). Only these two source units are configured today; an
// unrecognized sourceUnit is treated as "cannot compute a threshold"
// rather than guessed.
const TONNE_TO_SOURCE_UNIT_MULTIPLIER = { kg: 1000, t: 1 };

// Converts a tonnes threshold into the same scaled-integer "minor units"
// system weight-integrity.js already parsed Recorded Net into, reusing
// its own parseToMinorUnits() rather than a second ad-hoc rounding path
// (phase spec §4: prefer scaled integer comparison compatible with the
// existing weight-integrity implementation).
function computeThresholdMinorUnits(thresholdTonnes, sourceUnit, decimalPlaces) {
  const multiplier = TONNE_TO_SOURCE_UNIT_MULTIPLIER[sourceUnit];
  if (multiplier === undefined || typeof decimalPlaces !== "number") return null;
  const parsed = parseToMinorUnits(thresholdTonnes * multiplier, decimalPlaces);
  return parsed.ok ? parsed.minorUnits : null;
}

function buildMessage(recordedNetMinorUnits, thresholdMinorUnits, decimalPlaces, sourceUnit) {
  const scale = Math.pow(10, decimalPlaces);
  const recorded = (recordedNetMinorUnits / scale).toFixed(decimalPlaces);
  const threshold = (thresholdMinorUnits / scale).toFixed(decimalPlaces);
  return `Recorded Net (${recorded} ${sourceUnit}) is below the configured minimum of ${threshold} ${sourceUnit}.`;
}

// `weightIntegrity` is the row's already-computed validateWeightIntegrity()
// result (js/core/weight-integrity.js) — this function never re-parses
// Gross/Tare/Recorded Net itself. `config` is the full minimumNetWeight
// config map (keyed by profile id, config/app-config.json); resolves
// config[profile] itself so callers never have to.
export function validateMinimumNetWeight({ weightIntegrity, profile, config, sourceRowId }) {
  const profileConfig = config ? config[profile] : undefined;

  const base = {
    applicable: false,
    isLow: false,
    issueCode: null,
    severity: null,
    sourceRowId,
    profile,
    sourceUnit: weightIntegrity ? weightIntegrity.sourceUnit : undefined,
    decimalPlaces: weightIntegrity ? weightIntegrity.decimalPlaces : undefined,
    recordedNetMinorUnits: null,
    thresholdMinorUnits: null,
    thresholdTonnes: profileConfig ? profileConfig.thresholdTonnes : undefined,
    belowThresholdMinorUnits: null,
    message: "",
  };

  if (!profileConfig || profileConfig.enabled === false) return base;
  if (!weightIntegrity) return base;

  // Invalid-weight precedence (§5): a row whose Recorded Net (or whose
  // other weight fields) is already invalid keeps weight-integrity as the
  // sole authority — never a duplicate LOW_NET_WEIGHT for the same root
  // cause. recordedNetMinorUnits is null whenever Recorded Net itself
  // failed to parse, which this also naturally excludes.
  if (weightIntegrity.recordedNetMinorUnits === null || weightIntegrity.recordedNetMinorUnits === undefined) {
    return base;
  }
  if (weightIntegrity.issueCode && SUPPRESSING_WEIGHT_ISSUE_CODES.has(weightIntegrity.issueCode)) {
    return base;
  }

  const thresholdMinorUnits = computeThresholdMinorUnits(
    profileConfig.thresholdTonnes,
    weightIntegrity.sourceUnit,
    weightIntegrity.decimalPlaces
  );
  if (thresholdMinorUnits === null) return base;

  const recordedNetMinorUnits = weightIntegrity.recordedNetMinorUnits;
  const isLow = recordedNetMinorUnits < thresholdMinorUnits;

  if (!isLow) {
    return {
      ...base,
      applicable: true,
      thresholdMinorUnits,
      recordedNetMinorUnits,
      belowThresholdMinorUnits: 0,
    };
  }

  const belowThresholdMinorUnits = thresholdMinorUnits - recordedNetMinorUnits;

  return {
    ...base,
    applicable: true,
    isLow: true,
    issueCode: NET_WEIGHT_ISSUE_CODES.LOW_NET_WEIGHT,
    severity: NET_WEIGHT_ISSUE_SEVERITY[NET_WEIGHT_ISSUE_CODES.LOW_NET_WEIGHT],
    thresholdMinorUnits,
    recordedNetMinorUnits,
    belowThresholdMinorUnits,
    message: buildMessage(
      recordedNetMinorUnits,
      thresholdMinorUnits,
      weightIntegrity.decimalPlaces,
      weightIntegrity.sourceUnit
    ),
  };
}
