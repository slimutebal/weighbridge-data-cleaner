import { t } from "./i18n.js";

const BUCKET_LABEL_KEY = { DS: "import.dayShift", NS: "import.nightShift" };
const SHIFT_LABEL_KEY = { DS: "shift.day", NS: "shift.night" };

let dialogEl = null;
let lastTrigger = null;

function ensureDialog() {
  if (dialogEl) return dialogEl;
  dialogEl = document.createElement("dialog");
  dialogEl.className = "secondary-dialog wrong-bucket-modal";
  // A rejection interrupts the operator with a validation error that must
  // be acknowledged, not just informational — role="alertdialog" matches
  // that intent (UI-5D §14/§19). aria-labelledby points at whichever
  // rejection block's <h3> is marked "first" below.
  dialogEl.setAttribute("role", "alertdialog");
  dialogEl.setAttribute("aria-labelledby", "wrong-bucket-modal-title");
  document.body.appendChild(dialogEl);
  // Native <dialog> handles Escape-to-close and focus trapping; this only
  // adds returning focus to whatever had focus when the rejection was
  // triggered (a drop zone, browse button, or file input — this can be
  // reached via drag-and-drop too, so there is no single fixed opener
  // button to reference), matching the focus-restoration pattern already
  // used by every other secondary dialog in the app.
  dialogEl.addEventListener("close", () => {
    if (lastTrigger) lastTrigger.focus();
  });
  return dialogEl;
}

function addLine(container, label, value) {
  const p = document.createElement("p");
  p.className = "wrong-bucket-line";
  p.textContent = `${label}: ${value}`;
  container.appendChild(p);
}

function bucketLabel(bucketId) {
  return BUCKET_LABEL_KEY[bucketId] ? t(BUCKET_LABEL_KEY[bucketId]) : bucketId;
}

function shiftLabel(shiftId) {
  return SHIFT_LABEL_KEY[shiftId] ? t(SHIFT_LABEL_KEY[shiftId]) : shiftId;
}

function buildRejectionBlock(rejection, isFirst) {
  const wrap = document.createElement("div");
  wrap.className = "wrong-bucket-block";

  const title = document.createElement("h3");
  if (isFirst) title.id = "wrong-bucket-modal-title";
  title.textContent = rejection.ambiguous
    ? t("wrongBucket.unableToValidate")
    : t("wrongBucket.wrongBucket");
  wrap.appendChild(title);

  addLine(wrap, t("wrongBucket.file"), rejection.fileName);

  if (rejection.ambiguous) {
    const explain = document.createElement("p");
    explain.textContent = t("wrongBucket.ambiguousExplain");
    wrap.appendChild(explain);

    addLine(wrap, t("wrongBucket.dsRows"), rejection.dsCount);
    addLine(wrap, t("wrongBucket.nsRows"), rejection.nsCount);
    addLine(wrap, t("wrongBucket.unknownRows"), rejection.unknownCount);
    return wrap;
  }

  addLine(wrap, t("wrongBucket.selectedBucket"), bucketLabel(rejection.bucket));
  addLine(wrap, t("wrongBucket.detectedShift"), shiftLabel(rejection.detectedShift));
  addLine(wrap, t("wrongBucket.dsRows"), rejection.dsCount);
  addLine(wrap, t("wrongBucket.nsRows"), rejection.nsCount);
  addLine(wrap, t("wrongBucket.unknownRows"), rejection.unknownCount);

  const correctBucketId = rejection.bucket === "DS" ? "NS" : "DS";
  const instruction = document.createElement("p");
  instruction.className = "wrong-bucket-instruction";
  instruction.textContent = t("wrongBucket.instruction", { bucket: bucketLabel(correctBucketId) });
  wrap.appendChild(instruction);

  return wrap;
}

export function showWrongBucketModal(rejections) {
  if (!rejections || !rejections.length) return;

  lastTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const dialog = ensureDialog();
  dialog.innerHTML = "";

  rejections.forEach((rejection, index) => {
    if (index > 0) dialog.appendChild(document.createElement("hr"));
    dialog.appendChild(buildRejectionBlock(rejection, index === 0));
  });

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn-secondary";
  closeBtn.textContent = t("wrongBucket.ok");
  closeBtn.addEventListener("click", () => dialog.close());
  dialog.appendChild(closeBtn);

  dialog.showModal();
}
