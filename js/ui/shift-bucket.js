import { renderFileList } from "./imported-file-list.js";

const ACCEPTED_EXTENSIONS = [".xlsx", ".xlsm"];

function isAcceptedFile(file) {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function mergeFiles(existing, incoming) {
  const merged = [...existing];
  incoming.forEach((file) => {
    const alreadyAdded = merged.some(
      (existingFile) =>
        existingFile.name === file.name && existingFile.size === file.size
    );
    if (!alreadyAdded && isAcceptedFile(file)) {
      merged.push(file);
    }
  });
  return merged;
}

export function createShiftBucket({ id, label, hint, bucketId, onChange }) {
  let files = [];

  function notifyChange() {
    if (onChange) onChange(bucketId, files.slice());
  }

  const root = document.createElement("div");
  root.className = "shift-bucket";
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
    renderFileList(fileListContainer, files);
  }

  function addFiles(fileListLike) {
    files = mergeFiles(files, Array.from(fileListLike));
    refresh();
    notifyChange();
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
    getFiles: () => files.slice(),
    reset: () => {
      files = [];
      refresh();
      notifyChange();
    },
  };
}
