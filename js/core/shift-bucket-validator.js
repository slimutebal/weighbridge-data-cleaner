import { readWorkbook } from "./excel-reader.js";
import { loadShiftRules, classifyShift } from "./shift-classifier.js";
import { clean as cleanHync } from "../profiles/hync/cleaner.js";
import { clean as cleanSlnc } from "../profiles/slnc/cleaner.js";
import { clean as cleanEsg } from "../profiles/esg/cleaner.js";

const PROFILE_CLEANERS = [
  { id: "HYNC", clean: cleanHync },
  { id: "SLNC", clean: cleanSlnc },
  { id: "ESG", clean: cleanEsg },
];

// Shift-bucket validation only needs each row's own timestamp, never
// contractor matching — a no-op stub keeps this check fully independent of
// List DT state/logic (List DT is never loaded or touched from here).
function noopJoinContractor() {
  return { contractor: "Unmatched", normalizedDtId: "" };
}

// Reuses the real profile cleaners unmodified (same detection, same
// report-date grouping, same first-sheet-only scan) purely to get each
// row's _timestamp for shift counting — cleaning math itself is untouched.
export async function detectFileShift(file) {
  const workbook = await readWorkbook(file);
  const shiftRules = await loadShiftRules();

  let profileId = null;
  let result = null;
  for (const cleaner of PROFILE_CLEANERS) {
    const attempt = cleaner.clean(workbook, { joinContractor: noopJoinContractor, listDt: null });
    if (attempt) {
      profileId = cleaner.id;
      result = attempt;
      break;
    }
  }

  if (!result) {
    return {
      profileDetected: false,
      profileId: null,
      detectedShift: "UNKNOWN",
      dsCount: 0,
      nsCount: 0,
      unknownCount: 0,
    };
  }

  let dsCount = 0;
  let nsCount = 0;
  result.cleanRows.forEach((row) => {
    const shift = classifyShift(row._timestamp, profileId, shiftRules);
    if (shift === "DS") dsCount += 1;
    else if (shift === "NS") nsCount += 1;
  });

  // Rows that looked like genuine detail rows but had an unparseable
  // timestamp (cleaner.js's lostRows) — counted separately, never folded
  // into DS or NS.
  const unknownCount = result.lostRows.length;

  let detectedShift;
  if (dsCount > nsCount) detectedShift = "DS";
  else if (nsCount > dsCount) detectedShift = "NS";
  else detectedShift = "UNKNOWN"; // tie (including 0-0) is ambiguous, not a default

  return { profileDetected: true, profileId, detectedShift, dsCount, nsCount, unknownCount };
}

export function evaluateBucketMatch(file, bucketId, detection) {
  const { detectedShift, dsCount, nsCount, unknownCount } = detection;

  if (detectedShift === "UNKNOWN") {
    return {
      accepted: false,
      ambiguous: true,
      fileName: file.name,
      bucket: bucketId,
      dsCount,
      nsCount,
      unknownCount,
    };
  }

  if (detectedShift !== bucketId) {
    return {
      accepted: false,
      ambiguous: false,
      fileName: file.name,
      bucket: bucketId,
      detectedShift,
      dsCount,
      nsCount,
      unknownCount,
    };
  }

  return { accepted: true };
}
