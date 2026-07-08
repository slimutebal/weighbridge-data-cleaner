export function renderValidationPlaceholder(container) {
  container.innerHTML = "";

  const placeholder = document.createElement("p");
  placeholder.className = "placeholder-text";
  placeholder.textContent =
    "Validation and report details will appear here after cleaning is run.";

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

export function renderValidation(container, validation) {
  const wrap = document.createElement("div");
  wrap.className = "validation-metrics";

  wrap.appendChild(createMetricRow("Raw rows", validation.rawRowCount));
  wrap.appendChild(createMetricRow("Clean rows", validation.cleanRowCount));
  wrap.appendChild(createMetricRow("Lost rows", validation.lostRowCount));
  wrap.appendChild(createMetricRow("Raw tonnage", validation.rawTonnage.toFixed(2)));
  wrap.appendChild(createMetricRow("Clean tonnage", validation.cleanTonnage.toFixed(2)));
  wrap.appendChild(
    createMetricRow("Tonnage difference", validation.tonnageDifference.toFixed(2))
  );
  wrap.appendChild(createMetricRow("Duplicate NO.NOTA", validation.duplicateNotaCount));
  wrap.appendChild(createMetricRow("Missing Contractor", validation.missingContractorCount));
  wrap.appendChild(createMetricRow("Missing Source", validation.missingSourceCount));
  wrap.appendChild(createMetricRow("Missing Grade", validation.missingGradeCount));
  wrap.appendChild(createMetricRow("Unmatched DT rows", validation.unmatchedDtCount));

  container.appendChild(wrap);
}
