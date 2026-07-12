import { formatDecimal } from "../core/output-formatter.js";
import { t } from "./i18n.js";

export function renderValidationPlaceholder(container) {
  container.innerHTML = "";

  const placeholder = document.createElement("p");
  placeholder.className = "placeholder-text";
  placeholder.textContent = t("validation.placeholder");

  container.appendChild(placeholder);
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

export function renderValidation(container, validation, decimalSeparator = ".", profile) {
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
