import { renderFileList } from "./imported-file-list.js";
import { detectFileShift, evaluateBucketMatch } from "../core/shift-bucket-validator.js";
import { showWrongBucketModal } from "./wrong-bucket-modal.js";
import { announce } from "./live-announcer.js";

const ACCEPTED_EXTENSIONS = [".xlsx", ".xlsm"];

function isAcceptedFile(file) {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function createShiftBucket({ id, label, hint, bucketId, onChange }) {
  // Internal state is entries ({ id, file }), not bare File objects (Phase
  // B) — the id is the stable identity used to remove exactly one uploaded
  // file even when two entries share the same filename (or name+size).
  // getFiles()/onChange() still hand callers a plain File[] below, so
  // import-page.js and main.js need no changes at all.
  let entries = [];
  let nextEntrySeq = 0;

  // Scoped to this bucket instance (each createShiftBucket() call has its
  // own counter/closure) and prefixed with bucketId so ids stay unique
  // across the Day/Night buckets too.
  function makeEntryId() {
    nextEntrySeq += 1;
    return `${bucketId}-file-${nextEntrySeq}`;
  }

  function notifyChange() {
    if (onChange) onChange(bucketId, entries.map((entry) => entry.file));
  }

  const root = document.createElement("div");
  // Day/Night visual accent (v1.0.1-predeploy) — purely a CSS class for
  // .shift-bucket--day / .shift-bucket--night in css/app.css; does not
  // affect wrong-bucket validation, which is computed separately in
  // js/core/shift-bucket-validator.js.
  const accentClass =
    bucketId === "DS" ? "shift-bucket--day" : bucketId === "NS" ? "shift-bucket--night" : "";
  root.className = ["shift-bucket", accentClass].filter(Boolean).join(" ");
  root.id = id;

  const heading = document.createElement("h2");
  heading.textContent = label;

  const hintText = document.createElement("p");
  hintText.className = "shift-bucket-hint";
  hintText.textContent = hint;

  const dropZone = document.createElement("div");
  dropZone.className = "drop-zone";
  dropZone.tabIndex = 0;
  dropZone.setAttribute("role", "button");
  dropZone.setAttribute(
    "aria-label",
    `${label} drop zone, click or drop Excel files here`
  );
  dropZone.textContent = "Insert Excel Files or drop files here";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.accept = ACCEPTED_EXTENSIONS.join(",");
  fileInput.className = "visually-hidden-input";

  const fileListContainer = document.createElement("div");
  fileListContainer.className = "file-list-container";

  function refresh() {
    renderFileList(fileListContainer, entries, { onRemove: removeEntry });
  }

  // One removal action -> one state update -> one notifyChange() call, so
  // the existing import/cleaning pipeline (import-page.js's emitChange ->
  // main.js's handleFilesChange -> runCleaning) re-runs exactly once with
  // the remaining files, whether this bucket still has files afterward,
  // ends up empty, or both buckets end up empty (main.js's existing
  // no-files branch already returns to the empty result state — no new
  // logic needed here for that case).
  function removeEntry(entryId) {
    const removed = entries.find((entry) => entry.id === entryId);
    entries = entries.filter((entry) => entry.id !== entryId);
    refresh();
    notifyChange();
    if (removed) announce(`Removed ${removed.file.name}.`);
  }

  // Reads and shift-classifies a single candidate file against this
  // bucket's declared intent (v0.2.0-prepilot revision 5). Falls back to
  // accepting the file if validation itself throws for any reason, so a
  // bug/edge-case in this new check can never block the core upload flow —
  // the existing "could not detect profile" path downstream still catches
  // genuinely unreadable files.
  async function validateOneFile(file) {
    try {
      const detection = await detectFileShift(file);
      if (!detection.profileDetected) {
        return { accepted: true };
      }
      return evaluateBucketMatch(file, bucketId, detection);
    } catch (error) {
      console.error(`Shift-bucket validation failed for "${file.name}":`, error);
      return { accepted: true };
    }
  }

  async function addFiles(fileListLike) {
    const candidates = Array.from(fileListLike).filter(
      (file) =>
        isAcceptedFile(file) &&
        !entries.some(
          (entry) => entry.file.name === file.name && entry.file.size === file.size
        )
    );
    if (!candidates.length) return;

    const accepted = [];
    const rejections = [];

    for (const file of candidates) {
      const outcome = await validateOneFile(file);
      if (outcome.accepted) {
        accepted.push(file);
      } else {
        rejections.push(outcome);
      }
    }

    if (accepted.length) {
      entries = [...entries, ...accepted.map((file) => ({ id: makeEntryId(), file }))];
      refresh();
      notifyChange();
    }

    if (rejections.length) {
      showWrongBucketModal(rejections);
    }
  }

  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });

  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drop-zone-active");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drop-zone-active");
  });

  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("drop-zone-active");
    if (event.dataTransfer && event.dataTransfer.files) {
      addFiles(event.dataTransfer.files);
    }
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files) {
      addFiles(fileInput.files);
    }
    fileInput.value = "";
  });

  root.appendChild(heading);
  root.appendChild(hintText);
  root.appendChild(dropZone);
  root.appendChild(fileInput);
  root.appendChild(fileListContainer);

  refresh();

  return {
    element: root,
    getFiles: () => entries.map((entry) => entry.file),
    reset: () => {
      entries = [];
      refresh();
      notifyChange();
    },
  };
}
