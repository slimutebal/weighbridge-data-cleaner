// Low-net-weight confirmation dialog (v1.3.0, phase spec §11-13), mirroring
// js/ui/weight-exception-dialog.js's model. Row-scoped only — there is
// deliberately no "Approve All" entry point anywhere in this module or
// its callers, matching D011's weight-exception precedent.
import { approveLowNetException } from "../core/low-net-weight-store.js";
import { parseSourceRowId } from "../core/weight-integrity.js";
import { formatFullDatetime } from "../core/output-formatter.js";
import { t } from "./i18n.js";

let dialogEl = null;
let lastTrigger = null;

function ensureDialog() {
  if (dialogEl) return dialogEl;
  dialogEl = document.createElement("dialog");
  dialogEl.className = "secondary-dialog weight-exception-modal";
  dialogEl.setAttribute("aria-labelledby", "low-net-weight-dialog-title");
  document.body.appendChild(dialogEl);
  dialogEl.addEventListener("close", () => {
    if (lastTrigger) lastTrigger.focus();
  });
  return dialogEl;
}

function addDetailRow(container, label, value) {
  const row = document.createElement("div");
  row.className = "weight-exception-detail-row";
  const labelEl = document.createElement("span");
  labelEl.className = "weight-exception-detail-label";
  labelEl.textContent = label;
  const valueEl = document.createElement("span");
  valueEl.className = "weight-exception-detail-value";
  valueEl.textContent = value;
  row.appendChild(labelEl);
  row.appendChild(valueEl);
  container.appendChild(row);
}

function formatWeight(minorUnits, decimalPlaces, sourceUnit, decimalSeparator, forceSign = false) {
  if (minorUnits === null || minorUnits === undefined) return "—";
  const scale = Math.pow(10, decimalPlaces);
  const fixed = (minorUnits / scale).toFixed(decimalPlaces);
  const withSeparator = decimalSeparator === "," ? fixed.replace(".", ",") : fixed;
  const sign = forceSign && minorUnits > 0 ? "+" : "";
  return `${sign}${withSeparator}${sourceUnit ? " " + sourceUnit : ""}`;
}

function buildTextField(labelText, { required = false, multiline = false } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "weight-exception-field";

  const label = document.createElement("label");
  label.className = "weight-exception-field-label";
  label.textContent = required ? `${labelText} *` : labelText;

  const input = multiline ? document.createElement("textarea") : document.createElement("input");
  if (!multiline) input.type = "text";
  input.className = "weight-exception-field-input";
  const inputId = `low-net-weight-field-${Math.random().toString(36).slice(2)}`;
  input.id = inputId;
  label.htmlFor = inputId;

  wrap.appendChild(label);
  wrap.appendChild(input);
  return { wrap, input };
}

// context: { row, group, groupId, decimalSeparator }
// onResolved(): called after a successful Option B confirmation, so the
// caller (profile-page.js) can re-render the table/readiness in place.
export function openLowNetWeightDialog({ row, group, groupId, decimalSeparator }, onResolved, triggerButton) {
  const lnw = row._lowNetWeight;
  lastTrigger = triggerButton || null;

  const dialog = ensureDialog();
  dialog.innerHTML = "";

  const { worksheetName, sourceRowNumber } = parseSourceRowId(lnw.sourceRowId);

  const header = document.createElement("div");
  header.className = "weight-exception-header";
  const title = document.createElement("h3");
  title.id = "low-net-weight-dialog-title";
  title.textContent = t("weightException.dialogTitle");
  header.appendChild(title);
  dialog.appendChild(header);

  const evidenceLabel = document.createElement("p");
  evidenceLabel.className = "weight-exception-section-label";
  evidenceLabel.textContent = t("weightException.evidenceHeading");
  dialog.appendChild(evidenceLabel);

  const detail = document.createElement("div");
  detail.className = "weight-exception-detail";
  addDetailRow(detail, t("weightException.sourceRow"), sourceRowNumber || String(lnw.sourceRowId ?? ""));
  addDetailRow(detail, "NO.NOTA", String(row["NO.NOTA"] ?? ""));
  addDetailRow(detail, "NO. DT", String(row["NO. DT"] ?? ""));
  if (row.Datetime instanceof Date) {
    addDetailRow(detail, t("weightException.datetime"), formatFullDatetime(row.Datetime));
  }
  addDetailRow(
    detail,
    t("weightException.recordedNet"),
    formatWeight(lnw.recordedNetMinorUnits, lnw.decimalPlaces, lnw.sourceUnit, decimalSeparator)
  );
  addDetailRow(
    detail,
    t("lowNetException.minimum"),
    formatWeight(lnw.thresholdMinorUnits, lnw.decimalPlaces, lnw.sourceUnit, decimalSeparator)
  );
  addDetailRow(
    detail,
    t("lowNetException.belowBy"),
    formatWeight(lnw.belowThresholdMinorUnits, lnw.decimalPlaces, lnw.sourceUnit, decimalSeparator)
  );
  dialog.appendChild(detail);

  const decisionLabel = document.createElement("p");
  decisionLabel.className = "weight-exception-section-label";
  decisionLabel.textContent = t("weightException.decisionHeading");
  dialog.appendChild(decisionLabel);

  const optionsWrap = document.createElement("div");
  optionsWrap.className = "weight-exception-options";
  const optionGroupName = "low-net-weight-option";

  function buildOption(value, labelText) {
    const optionLabel = document.createElement("label");
    optionLabel.className = "weight-exception-option";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = optionGroupName;
    radio.value = value;
    const text = document.createElement("span");
    text.textContent = labelText;
    optionLabel.appendChild(radio);
    optionLabel.appendChild(text);
    optionsWrap.appendChild(optionLabel);
    return radio;
  }

  const optionARadio = buildOption("A", t("lowNetException.optionA"));
  const optionBRadio = buildOption("B", t("lowNetException.optionB"));
  dialog.appendChild(optionsWrap);

  const optionABody = document.createElement("p");
  optionABody.className = "placeholder-text weight-exception-option-body";
  optionABody.textContent = t("lowNetException.optionANote");
  optionABody.hidden = true;
  dialog.appendChild(optionABody);

  const optionBBody = document.createElement("div");
  optionBBody.className = "weight-exception-option-body";
  optionBBody.hidden = true;

  const { wrap: confirmedByWrap, input: confirmedByInput } = buildTextField(
    t("weightException.confirmedBy"),
    { required: true }
  );
  const { wrap: referenceWrap, input: referenceInput } = buildTextField(
    t("weightException.confirmationReference"),
    { required: true }
  );
  const { wrap: notesWrap, input: notesInput } = buildTextField(t("weightException.notes"), {
    multiline: true,
  });

  optionBBody.appendChild(confirmedByWrap);
  optionBBody.appendChild(referenceWrap);
  optionBBody.appendChild(notesWrap);

  const disclaimer = document.createElement("p");
  disclaimer.className = "weight-exception-disclaimer";
  disclaimer.textContent = t("weightException.disclaimer");
  optionBBody.appendChild(disclaimer);

  dialog.appendChild(optionBBody);

  const footer = document.createElement("div");
  footer.className = "weight-exception-footer";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn-secondary";
  cancelBtn.textContent = t("common.cancel");
  cancelBtn.addEventListener("click", () => dialog.close());
  footer.appendChild(cancelBtn);

  const primaryBtn = document.createElement("button");
  primaryBtn.type = "button";
  primaryBtn.className = "btn-primary";
  primaryBtn.disabled = true;
  footer.appendChild(primaryBtn);
  dialog.appendChild(footer);

  function updatePrimaryButton() {
    if (optionARadio.checked) {
      primaryBtn.textContent = t("common.close");
      primaryBtn.disabled = false;
    } else if (optionBRadio.checked) {
      primaryBtn.textContent = t("weightException.confirmAction");
      const valid = confirmedByInput.value.trim() !== "" && referenceInput.value.trim() !== "";
      primaryBtn.disabled = !valid;
    } else {
      primaryBtn.textContent = t("weightException.confirmAction");
      primaryBtn.disabled = true;
    }
  }

  function selectOption(value) {
    optionABody.hidden = value !== "A";
    optionBBody.hidden = value !== "B";
    updatePrimaryButton();
  }

  optionARadio.addEventListener("change", () => selectOption("A"));
  optionBRadio.addEventListener("change", () => selectOption("B"));
  confirmedByInput.addEventListener("input", updatePrimaryButton);
  referenceInput.addEventListener("input", updatePrimaryButton);

  primaryBtn.addEventListener("click", () => {
    if (optionARadio.checked) {
      // Option A: no exception is created — the low-net finding remains
      // unresolved, and the operator is expected to correct or obtain a
      // corrected source file and re-run cleaning (§12).
      dialog.close();
      return;
    }
    if (!optionBRadio.checked) return;

    approveLowNetException({
      groupId,
      sourceRowId: lnw.sourceRowId,
      sourceFilename: row._sourceFilename || "",
      worksheetName,
      sourceRowNumber,
      profile: lnw.profile || group.profile,
      recordedNetMinorUnits: lnw.recordedNetMinorUnits,
      thresholdMinorUnits: lnw.thresholdMinorUnits,
      thresholdTonnes: lnw.thresholdTonnes,
      confirmedBy: confirmedByInput.value.trim(),
      confirmationReference: referenceInput.value.trim(),
      notes: notesInput.value.trim(),
      confirmedAt: new Date().toISOString(),
    });

    dialog.close();
    if (onResolved) onResolved();
  });

  dialog.showModal();
}

export function closeLowNetWeightDialog() {
  if (dialogEl && dialogEl.open) dialogEl.close();
}
