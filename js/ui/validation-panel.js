import { formatDecimal } from "../core/output-formatter.js";
import { READINESS } from "../core/readiness.js";
import { t } from "./i18n.js";

export function renderValidationPlaceholder(container) {
  container.innerHTML = "";

  const placeholder = document.createElement("p");
  placeholder.className = "placeholder-text";
  placeholder.textContent = t("validation.placeholder");

  container.appendChild(placeholder);
}

// Display-only remapping of the core readiness enum (js/core/readiness.js,
// untouched) to the same short-label translation keys already used for the
// group-header chip and profile-tab badge (result-page.js / profile-page.js)
// — one wording per readiness status across the whole app, never a second
// decision.
const READINESS_TILE_KEY = {
  [READINESS.READY]: "readiness.short.ready",
  [READINESS.READY_WITH_INFO]: "readiness.short.readyInfo",
  [READINESS.ACTION_REQUIRED]: "readiness.short.actionRequired",
  [READINESS.FAILED]: "readiness.short.failed",
};

// Same three-color language as .cleaning-status-* / the group-header chip —
// reused, not reinvented, so the tile's accent always agrees with every
// other readiness-driven color in the UI.
const READINESS_TILE_CLASS = {
  [READINESS.READY]: "headline-tile-ready",
  [READINESS.READY_WITH_INFO]: "headline-tile-info",
  [READINESS.ACTION_REQUIRED]: "headline-tile-blocked",
  [READINESS.FAILED]: "headline-tile-blocked",
};

function createHeadlineTile(label, value, extraClass) {
  const tile = document.createElement("div");
  tile.className = extraClass ? `headline-tile ${extraClass}` : "headline-tile";

  const labelEl = document.createElement("div");
  labelEl.className = "headline-tile-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("div");
  valueEl.className = "headline-tile-value";
  valueEl.textContent = value;

  tile.appendChild(labelEl);
  tile.appendChild(valueEl);
  return tile;
}

// Four headline tiles (Rows / Tonnage / Tonnage Difference / Readiness),
// consuming only values already computed elsewhere (validation object from
// validation-engine.js, readiness object from computeGroupReadiness) —
// never a second row-count, tonnage sum, difference, or readiness decision.
// Sits above the existing detailed .validation-metrics grid, which remains
// unchanged in meaning and is still the authoritative detailed report.
function renderHeadlineMetrics(container, validation, decimalSeparator, readiness) {
  const grid = document.createElement("div");
  grid.className = "headline-metrics";

  grid.appendChild(
    createHeadlineTile(
      t("headline.rows"),
      t("headline.rawCleanValue", { raw: validation.rawRowCount, clean: validation.cleanRowCount })
    )
  );

  grid.appendChild(
    createHeadlineTile(
      t("headline.tonnage"),
      t("headline.rawCleanValue", {
        raw: formatDecimal(validation.rawTonnage, decimalSeparator),
        clean: formatDecimal(validation.cleanTonnage, decimalSeparator),
      })
    )
  );

  // "Zero" here only decides which already-approved semantic color token
  // this tile shows — it re-derives nothing about validation/readiness.
  // Rounded the same way formatDecimal() rounds for display (toFixed(2))
  // so the tile's color always agrees with the exact digits shown, instead
  // of a raw floating-point value flipping color while still displaying as
  // "0.00" due to an unrelated rounding artifact.
  const roundedDifference = Math.round(Number(validation.tonnageDifference) * 100) / 100;
  grid.appendChild(
    createHeadlineTile(
      t("headline.tonnageDifference"),
      formatDecimal(validation.tonnageDifference, decimalSeparator),
      roundedDifference === 0 ? "headline-tile-diff-zero" : "headline-tile-diff-nonzero"
    )
  );

  grid.appendChild(
    createHeadlineTile(
      t("headline.readiness"),
      t(READINESS_TILE_KEY[readiness.status]),
      READINESS_TILE_CLASS[readiness.status]
    )
  );

  container.appendChild(grid);
}

function createMetricRow(label, value) {
  const row = document.createElement("div");
  row.className = "metric-row";

  const labelEl = document.createElement("span");
  labelEl.className = "metric-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "metric-value";
  valueEl.textContent = value;

  row.appendChild(labelEl);
  row.appendChild(valueEl);
  return row;
}

export function renderValidation(container, validation, decimalSeparator = ".", profile, readiness) {
  if (readiness) {
    renderHeadlineMetrics(container, validation, decimalSeparator, readiness);
  }

  const wrap = document.createElement("div");
  wrap.className = "validation-metrics";

  wrap.appendChild(createMetricRow(t("validation.rawRows"), validation.rawRowCount));
  wrap.appendChild(createMetricRow(t("validation.cleanRows"), validation.cleanRowCount));
  if (profile === "ESG") {
    // Informational only: ESG report/template section boundaries, never a
    // blocking issue (see computeGroupValidation in validation-engine.js).
    wrap.appendChild(createMetricRow(t("validation.esgReportGroups"), validation.esgReportGroups));
  } else {
    wrap.appendChild(createMetricRow(t("validation.lostRows"), validation.lostRowCount));
  }
  wrap.appendChild(
    createMetricRow(t("validation.rawTonnage"), formatDecimal(validation.rawTonnage, decimalSeparator))
  );
  wrap.appendChild(
    createMetricRow(t("validation.cleanTonnage"), formatDecimal(validation.cleanTonnage, decimalSeparator))
  );
  wrap.appendChild(
    createMetricRow(
      t("validation.tonnageDifference"),
      formatDecimal(validation.tonnageDifference, decimalSeparator)
    )
  );
  wrap.appendChild(createMetricRow(t("validation.duplicateNota"), validation.duplicateNotaCount));
  wrap.appendChild(createMetricRow(t("validation.missingContractor"), validation.missingContractorCount));
  wrap.appendChild(createMetricRow(t("validation.missingSource"), validation.missingSourceCount));
  wrap.appendChild(createMetricRow(t("validation.missingGrade"), validation.missingGradeCount));
  wrap.appendChild(createMetricRow(t("validation.unmatchedDtRows"), validation.unmatchedDtCount));
  wrap.appendChild(
    createMetricRow(t("validation.timestampWindowInfoRows"), validation.shiftWarningCount)
  );
  wrap.appendChild(
    createMetricRow(t("validation.pileIdSourceConflicts"), validation.pileIdSourceConflictCount)
  );

  container.appendChild(wrap);
}
