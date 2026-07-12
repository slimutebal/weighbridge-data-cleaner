import { t } from "./i18n.js";

const BUCKET_LABEL_KEY = { DS: "import.dayShift", NS: "import.nightShift" };
const SHIFT_LABEL_KEY = { DS: "shift.day", NS: "shift.night" };

let dialogEl = null;

function ensureDialog() {
  if (dialogEl) return dialogEl;
  dialogEl = document.createElement("dialog");
  dialogEl.className = "wrong-bucket-modal";
  document.body.appendChild(dialogEl);
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

function buildRejectionBlock(rejection) {
  const wrap = document.createElement("div");
  wrap.className = "wrong-bucket-block";

  const title = document.createElement("h3");
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

  const dialog = ensureDialog();
  dialog.innerHTML = "";

  rejections.forEach((rejection, index) => {
    if (index > 0) dialog.appendChild(document.createElement("hr"));
    dialog.appendChild(buildRejectionBlock(rejection));
  });

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn-secondary";
  closeBtn.textContent = t("wrongBucket.ok");
  closeBtn.addEventListener("click", () => dialog.close());
  dialog.appendChild(closeBtn);

  dialog.showModal();
}
