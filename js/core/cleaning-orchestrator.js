import { readWorkbook } from "./excel-reader.js";
import { loadShiftRules, classifyShift } from "./shift-classifier.js";
import { loadListDt, joinContractor } from "./list-dt-manager.js";
import { computeGroupValidation } from "./validation-engine.js";
import { buildGroupSummary } from "./report-builder.js";
import { clean as cleanHync } from "../profiles/hync/cleaner.js";
import { clean as cleanSlnc } from "../profiles/slnc/cleaner.js";
import { clean as cleanEsg } from "../profiles/esg/cleaner.js";

const PROFILE_CLEANERS = [
  { id: "HYNC", clean: cleanHync },
  { id: "SLNC", clean: cleanSlnc },
  { id: "ESG", clean: cleanEsg },
];

export async function runCleaning(bucketedFiles) {
  const [shiftRules, listDt] = await Promise.all([loadShiftRules(), loadListDt()]);

  const warnings = [];
  const fileErrors = [];
  const groupMap = new Map();

  for (const { file, bucket } of bucketedFiles) {
    try {
      const workbook = await readWorkbook(file);

      let profileId = null;
      let result = null;
      for (const cleaner of PROFILE_CLEANERS) {
        const attempt = cleaner.clean(workbook, { joinContractor, listDt });
        if (attempt) {
          profileId = cleaner.id;
          result = attempt;
          break;
        }
      }

      if (!result) {
        fileErrors.push({
          fileName: file.name,
          message: "Could not detect profile (not HYNC, SLNC, or ESG).",
        });
        continue;
      }

      if (result.lostRows.length) {
        warnings.push({
          type: "lost-rows",
          fileName: file.name,
          message: `${result.lostRows.length} row(s) in "${file.name}" appear to be detail rows but have an invalid or missing timestamp and were excluded.`,
        });
      }

      const skippedRows = result.skippedRows || [];
      if (skippedRows.length) {
        warnings.push({
          type: "skipped-non-detail",
          fileName: file.name,
          message: `${skippedRows.length} non-detail/report row(s) in "${file.name}" were skipped (headers, subtotal, blank, or metadata rows).`,
        });
      }

      const shiftsInFile = new Set();

      result.cleanRows.forEach((row) => {
        const shift = classifyShift(row._timestamp, profileId, shiftRules);
        row.Shift = shift;
        shiftsInFile.add(shift);

        const key = `${profileId}|${row.TANGGAL}|${shift}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            profile: profileId,
            date: row.TANGGAL,
            shift,
            rows: [],
            sourceFiles: new Set(),
            buckets: new Set(),
          });
        }
        const group = groupMap.get(key);
        group.rows.push(row);
        group.sourceFiles.add(file.name);
        group.buckets.add(bucket);
      });

      if (shiftsInFile.size > 1) {
        warnings.push({
          type: "mixed-shift",
          fileName: file.name,
          message: `Mixed shift detected inside "${file.name}". Rows have been split into separate Profile + Date + Shift groups.`,
        });
      }

      shiftsInFile.forEach((shift) => {
        if (shift !== bucket) {
          warnings.push({
            type: "bucket-mismatch",
            fileName: file.name,
            message: `"${file.name}": detected shift ${shift} does not match declared bucket ${bucket}.`,
          });
        }
      });
    } catch (error) {
      fileErrors.push({ fileName: file.name, message: error.message });
    }
  }

  const groups = Array.from(groupMap.values())
    .map((group) => ({
      profile: group.profile,
      date: group.date,
      shift: group.shift,
      rows: group.rows,
      sourceFiles: Array.from(group.sourceFiles),
      buckets: Array.from(group.buckets),
      validation: computeGroupValidation(group),
      summary: buildGroupSummary(group),
    }))
    .sort((a, b) =>
      `${a.profile}${a.date}${a.shift}`.localeCompare(`${b.profile}${b.date}${b.shift}`)
    );

  return {
    groups,
    warnings,
    fileErrors,
    listDtInfo: {
      source: listDt.source,
      recordCount: listDt.recordCount,
      duplicates: listDt.duplicates,
      updatedAt: listDt.updatedAt,
    },
  };
}
