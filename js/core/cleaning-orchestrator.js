import { readWorkbook } from "./excel-reader.js";
import { loadShiftRules, classifyShift } from "./shift-classifier.js";
import { loadListDt, joinContractor } from "./list-dt-manager.js";
import { loadAppConfig } from "./app-settings.js";
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
  const [shiftRules, listDt, appConfig] = await Promise.all([
    loadShiftRules(),
    loadListDt(),
    loadAppConfig(),
  ]);
  // Row-level weight integrity (v1.1.0, DECISIONS.md D010) is profile-aware
  // and config-driven (config/app-config.json "weightIntegrity"), reusing
  // the same app-config loader the UI shell already uses — see
  // js/core/weight-integrity.js for the shared validation module.
  const weightIntegrityConfig = appConfig.weightIntegrity || {};

  const warnings = [];
  const fileErrors = [];
  const groupMap = new Map();

  for (const { file, bucket } of bucketedFiles) {
    try {
      const workbook = await readWorkbook(file);

      let profileId = null;
      let result = null;
      for (const cleaner of PROFILE_CLEANERS) {
        const attempt = cleaner.clean(workbook, { joinContractor, listDt, weightIntegrityConfig });
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
        if (profileId === "ESG") {
          // ESG's repeated-block report structure means these are report-
          // section boundary rows, not discarded hauling records (see
          // computeGroupValidation in validation-engine.js) — informational,
          // not a warning.
          warnings.push({
            type: "esg-report-groups",
            fileName: file.name,
            profile: profileId,
            message: `${result.lostRows.length} report/template row(s) in "${file.name}" are ESG report-section boundaries, not hauling data, and are shown for information only.`,
          });
        } else {
          warnings.push({
            type: "lost-rows",
            fileName: file.name,
            profile: profileId,
            message: `${result.lostRows.length} row(s) in "${file.name}" appear to be detail rows but have an invalid or missing timestamp and were excluded.`,
          });
        }
      }

      const skippedRows = result.skippedRows || [];
      if (skippedRows.length) {
        warnings.push({
          type: "skipped-non-detail",
          fileName: file.name,
          profile: profileId,
          message: `${skippedRows.length} non-detail/report row(s) in "${file.name}" were skipped (headers, subtotal, blank, or metadata rows).`,
        });
      }

      // Operational grouping is Profile + Date + Declared Bucket (v0.2.0).
      // Row-level detected shift (IV-1) is still computed and kept on every
      // row; rows whose detected shift differs from the bucket are not
      // split into a separate group — they surface as shift warnings within
      // this same group instead (see computeGroupValidation).
      const groupKeysTouched = new Set();

      result.cleanRows.forEach((row) => {
        // Clean output Shift is always the declared bucket (v0.2 pilot fix:
        // Night Shift Input files must show Shift = NS for every row, even
        // if a row's own timestamp falls on the DS side of the boundary).
        // Row-level detected shift is preserved separately in
        // _detectedShift for Shift Warning Rows / validation / wrong-bucket
        // use — it must never overwrite the clean output Shift field.
        row._detectedShift = classifyShift(row._timestamp, profileId, shiftRules);
        row.Shift = bucket;
        // Traceability for the weight-exception approval record (v1.2.0,
        // §9) — a group can merge rows from more than one uploaded file, so
        // group.sourceFiles alone can't identify which exact file a given
        // row came from. Internal field only, never part of the output
        // schema/TSV (same convention as _rawDtId/_timestamp/_sourceRowId).
        row._sourceFilename = file.name;

        const key = `${profileId}|${row.TANGGAL}|${bucket}`;
        groupKeysTouched.add(key);
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            profile: profileId,
            date: row.TANGGAL,
            bucket,
            rows: [],
            sourceFiles: new Set(),
            skippedRowsCount: 0,
            lostRowsCount: 0,
            lostRowsDetail: [],
          });
        }
        const group = groupMap.get(key);
        group.rows.push(row);
        group.sourceFiles.add(file.name);
      });

      groupKeysTouched.forEach((key) => {
        const group = groupMap.get(key);
        group.skippedRowsCount += skippedRows.length;
        group.lostRowsCount += result.lostRows.length;
        // Genuinely lost rows never reach a TANGGAL grouping (parsing
        // failed before a report date could be derived), so their detail
        // is attached to every group this file touched — mirrors the
        // existing lostRowsCount aggregation above, just carrying the
        // per-row reason/identity alongside the count for auditability.
        result.lostRows.forEach((lostRow) => {
          group.lostRowsDetail.push({ ...lostRow, fileName: file.name, profile: profileId });
        });
      });
    } catch (error) {
      fileErrors.push({ fileName: file.name, message: error.message });
    }
  }

  const groups = Array.from(groupMap.values())
    .map((group) => {
      const validation = computeGroupValidation(group);
      return {
        profile: group.profile,
        date: group.date,
        bucket: group.bucket,
        rows: group.rows,
        sourceFiles: Array.from(group.sourceFiles),
        skippedRowsCount: group.skippedRowsCount,
        lostRowsCount: group.lostRowsCount,
        validation,
        summary: buildGroupSummary(group, validation),
      };
    })
    .sort((a, b) =>
      `${a.profile}${a.date}${a.bucket}`.localeCompare(`${b.profile}${b.date}${b.bucket}`)
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
