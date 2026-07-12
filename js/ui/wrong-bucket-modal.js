const BUCKET_LABELS = { DS: "Day Shift Input", NS: "Night Shift Input" };
const SHIFT_LABELS = { DS: "Day Shift", NS: "Night Shift" };

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

function buildRejectionBlock(rejection) {
  const wrap = document.createElement("div");
  wrap.className = "wrong-bucket-block";

  const title = document.createElement("h3");
  title.textContent = rejection.ambiguous ? "Unable to validate shift" : "Wrong shift bucket";
  wrap.appendChild(title);

  addLine(wrap, "File", rejection.fileName);

  if (rejection.ambiguous) {
    const explain = document.createElement("p");
    explain.textContent =
      "The app could not determine whether this file is Day Shift or Night Shift from timestamps. This file was removed.";
    wrap.appendChild(explain);

    addLine(wrap, "DS rows", rejection.dsCount);
    addLine(wrap, "NS rows", rejection.nsCount);
    addLine(wrap, "Unknown timestamp rows", rejection.unknownCount);
    return wrap;
  }

  addLine(wrap, "Selected bucket", BUCKET_LABELS[rejection.bucket] || rejection.bucket);
  addLine(
    wrap,
    "Detected shift",
    SHIFT_LABELS[rejection.detectedShift] || rejection.detectedShift
  );
  addLine(wrap, "DS rows", rejection.dsCount);
  addLine(wrap, "NS rows", rejection.nsCount);
  addLine(wrap, "Unknown timestamp rows", rejection.unknownCount);

  const correctBucketId = rejection.bucket === "DS" ? "NS" : "DS";
  const instruction = document.createElement("p");
  instruction.className = "wrong-bucket-instruction";
  instruction.textContent = `This file was removed. Please upload it to ${BUCKET_LABELS[correctBucketId]}.`;
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
  closeBtn.textContent = "OK";
  closeBtn.addEventListener("click", () => dialog.close());
  dialog.appendChild(closeBtn);

  dialog.showModal();
}
