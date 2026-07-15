// Row-level weight integrity validation (v1.1.0). Pure, profile-agnostic
// core: HYNC/SLNC/ESG cleaners only ever supply the correct raw Gross/
// Tare/Recorded Net field values and profile id — all arithmetic and
// classification lives here exactly once (see CLEANING_LOGIC_SPEC.md §19,
// DECISIONS.md D010).
//
// Business rule (non-negotiable, D010): this module only detects and
// reports a mismatch between Gross - Tare and Recorded Net. It never
// recomputes or overwrites Recorded Net, Gross, or Tare — the clean
// output Net always stays the recorded source value. A mismatch blocks
// copy/readiness for confirmation with the weighbridge team; source
// correction happens outside the app followed by a re-upload and re-run.

export const WEIGHT_ISSUE_CODES = {
  INVALID_GROSS_WEIGHT: "INVALID_GROSS_WEIGHT",
  INVALID_TARE_WEIGHT: "INVALID_TARE_WEIGHT",
  INVALID_RECORDED_NET_WEIGHT: "INVALID_RECORDED_NET_WEIGHT",
  NEGATIVE_WEIGHT_VALUE: "NEGATIVE_WEIGHT_VALUE",
  GROSS_BELOW_TARE: "GROSS_BELOW_TARE",
  WEIGHT_CALCULATION_MISMATCH: "WEIGHT_CALCULATION_MISMATCH",
};

// Every currently-defined weight issue is blocking (§6 of the phase spec).
// Kept as an explicit map (rather than "everything is blocking") so a
// future non-blocking weight issue can be added without an implicit
// assumption baked into every caller.
export const WEIGHT_ISSUE_SEVERITY = {
  [WEIGHT_ISSUE_CODES.INVALID_GROSS_WEIGHT]: "blocking",
  [WEIGHT_ISSUE_CODES.INVALID_TARE_WEIGHT]: "blocking",
  [WEIGHT_ISSUE_CODES.INVALID_RECORDED_NET_WEIGHT]: "blocking",
  [WEIGHT_ISSUE_CODES.NEGATIVE_WEIGHT_VALUE]: "blocking",
  [WEIGHT_ISSUE_CODES.GROSS_BELOW_TARE]: "blocking",
  [WEIGHT_ISSUE_CODES.WEIGHT_CALCULATION_MISMATCH]: "blocking",
};

export const WEIGHT_INTEGRITY_STATUS = {
  OK: "OK",
  DISABLED: "DISABLED",
  ...WEIGHT_ISSUE_CODES,
};

// Parses a raw source cell value into an exact integer count of "minor
// units" (the smallest unit implied by `decimalPlaces` — e.g. whole kg for
// decimalPlaces=0, hundredths of a tonne for decimalPlaces=2), without ever
// comparing floating-point weights directly (see phase spec §3).
//
// Uses the value's own canonical string form (`Number#toString()` always
// yields the shortest decimal string that round-trips to the same IEEE754
// double) and shifts the decimal point via string slicing rather than
// multiplying by a power of ten — a real weighbridge reading's fractional
// part is a JS numeric literal, so its shortest string form already *is*
// its exact decimal digits, e.g. 73.26 stringifies to "73.26", never
// "73.25999999999999". Only if the source ever supplies more fractional
// digits than `decimalPlaces` configures (unexpected for real weighbridge
// output) does this fall back to Math.round(value * scale).
export function parseToMinorUnits(rawValue, decimalPlaces) {
  if (rawValue === undefined || rawValue === null) return { ok: false };

  const trimmed = typeof rawValue === "string" ? rawValue.trim() : rawValue;
  if (trimmed === "") return { ok: false };

  const num = Number(trimmed);
  if (!Number.isFinite(num)) return { ok: false };

  const str = num.toString();
  if (/e/i.test(str)) {
    // Exponential notation only appears for magnitudes far outside any real
    // weighbridge reading; treat as unparseable rather than guess.
    return { ok: false };
  }

  const negative = str.startsWith("-");
  const unsigned = negative ? str.slice(1) : str;
  const [intPart, fracPart = ""] = unsigned.split(".");

  let minorUnits;
  if (fracPart.length <= decimalPlaces) {
    const digits = intPart + fracPart.padEnd(decimalPlaces, "0");
    minorUnits = parseInt(digits, 10);
  } else {
    // More fractional precision than configured — round to the configured
    // minor unit rather than truncate.
    minorUnits = Math.round(num * Math.pow(10, decimalPlaces));
  }

  return { ok: true, minorUnits: negative ? -minorUnits : minorUnits };
}

function buildMessage(issueCode, details) {
  switch (issueCode) {
    case WEIGHT_ISSUE_CODES.INVALID_GROSS_WEIGHT:
      return "Gross weight is missing or not a valid number.";
    case WEIGHT_ISSUE_CODES.INVALID_TARE_WEIGHT:
      return "Tare weight is missing or not a valid number.";
    case WEIGHT_ISSUE_CODES.INVALID_RECORDED_NET_WEIGHT:
      return "Recorded Net weight is missing or not a valid number.";
    case WEIGHT_ISSUE_CODES.NEGATIVE_WEIGHT_VALUE:
      return "A parsed weight value is negative.";
    case WEIGHT_ISSUE_CODES.GROSS_BELOW_TARE:
      return "Gross weight is lower than Tare weight.";
    case WEIGHT_ISSUE_CODES.WEIGHT_CALCULATION_MISMATCH: {
      const sign = details.differenceMinorUnits > 0 ? "+" : "";
      return `Calculated Net (Gross − Tare) differs from Recorded Net by ${sign}${details.differenceMinorUnits} minor unit(s).`;
    }
    default:
      return "";
  }
}

// Pure row-level check. `config` is the full weightIntegrity config map
// (keyed by profile id, as loaded from config/app-config.json); this
// function resolves config[profile] itself so callers never have to.
// Never mutates gross/tare/recordedNet — the caller's clean row keeps its
// own Recorded Net untouched regardless of this result (D010).
export function validateWeightIntegrity({ gross, tare, recordedNet, profile, config, sourceRowId }) {
  const profileConfig = config ? config[profile] : undefined;

  if (!profileConfig || profileConfig.enabled === false) {
    return {
      status: WEIGHT_INTEGRITY_STATUS.DISABLED,
      isValid: true,
      severity: null,
      sourceRowId,
      profile,
      sourceUnit: profileConfig ? profileConfig.sourceUnit : undefined,
      decimalPlaces: profileConfig ? profileConfig.decimalPlaces : undefined,
      toleranceMinorUnits: profileConfig ? profileConfig.toleranceMinorUnits : undefined,
      grossMinorUnits: null,
      tareMinorUnits: null,
      recordedNetMinorUnits: null,
      calculatedNetMinorUnits: null,
      differenceMinorUnits: null,
      absoluteDifferenceMinorUnits: null,
      issueCode: null,
      message: "",
    };
  }

  const { sourceUnit, decimalPlaces, toleranceMinorUnits = 0 } = profileConfig;

  const grossParsed = parseToMinorUnits(gross, decimalPlaces);
  const tareParsed = parseToMinorUnits(tare, decimalPlaces);
  const recordedNetParsed = parseToMinorUnits(recordedNet, decimalPlaces);

  const base = {
    sourceRowId,
    profile,
    sourceUnit,
    decimalPlaces,
    toleranceMinorUnits,
    grossMinorUnits: grossParsed.ok ? grossParsed.minorUnits : null,
    tareMinorUnits: tareParsed.ok ? tareParsed.minorUnits : null,
    recordedNetMinorUnits: recordedNetParsed.ok ? recordedNetParsed.minorUnits : null,
    calculatedNetMinorUnits: null,
    differenceMinorUnits: null,
    absoluteDifferenceMinorUnits: null,
  };

  // Most-specific-issue-wins (§6): a single unparseable field is reported
  // once as its own issue, never compounded into a calculation mismatch.
  if (!grossParsed.ok) {
    return finalize(base, WEIGHT_ISSUE_CODES.INVALID_GROSS_WEIGHT);
  }
  if (!tareParsed.ok) {
    return finalize(base, WEIGHT_ISSUE_CODES.INVALID_TARE_WEIGHT);
  }
  if (!recordedNetParsed.ok) {
    return finalize(base, WEIGHT_ISSUE_CODES.INVALID_RECORDED_NET_WEIGHT);
  }

  if (
    base.grossMinorUnits < 0 ||
    base.tareMinorUnits < 0 ||
    base.recordedNetMinorUnits < 0
  ) {
    return finalize(base, WEIGHT_ISSUE_CODES.NEGATIVE_WEIGHT_VALUE);
  }

  if (base.grossMinorUnits < base.tareMinorUnits) {
    return finalize(base, WEIGHT_ISSUE_CODES.GROSS_BELOW_TARE);
  }

  const calculatedNetMinorUnits = base.grossMinorUnits - base.tareMinorUnits;
  const differenceMinorUnits = calculatedNetMinorUnits - base.recordedNetMinorUnits;
  const absoluteDifferenceMinorUnits = Math.abs(differenceMinorUnits);

  const withCalculation = {
    ...base,
    calculatedNetMinorUnits,
    differenceMinorUnits,
    absoluteDifferenceMinorUnits,
  };

  if (absoluteDifferenceMinorUnits > toleranceMinorUnits) {
    return finalize(withCalculation, WEIGHT_ISSUE_CODES.WEIGHT_CALCULATION_MISMATCH);
  }

  return {
    ...withCalculation,
    status: WEIGHT_INTEGRITY_STATUS.OK,
    isValid: true,
    severity: null,
    issueCode: null,
    message: "",
  };
}

// Splits a sourceRowId ("<worksheet name>#R<Excel row number>", the shape
// every profile cleaner emits — see hync/slnc/esg cleaner.js) back into
// its parts, for audit displays (Weight Integrity Issues table, the
// weight-exception confirmation dialog, §9's approved-exception record)
// that need the worksheet name and row number separately rather than the
// combined id. Falls back to the raw id (with worksheetName empty) if it
// doesn't match the expected shape, so an unexpected id never throws.
export function parseSourceRowId(sourceRowId) {
  if (!sourceRowId) return { worksheetName: "", sourceRowNumber: "" };
  const match = String(sourceRowId).match(/^(.*)#R(\d+)$/);
  if (!match) return { worksheetName: "", sourceRowNumber: String(sourceRowId) };
  return { worksheetName: match[1], sourceRowNumber: match[2] };
}

function finalize(details, issueCode) {
  return {
    ...details,
    status: issueCode,
    isValid: false,
    severity: WEIGHT_ISSUE_SEVERITY[issueCode],
    issueCode,
    message: buildMessage(issueCode, details),
  };
}
