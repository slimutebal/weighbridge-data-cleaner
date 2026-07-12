import { t } from "./i18n.js";

// entries: [{ id, file }] — id is the stable per-entry identity assigned by
// createShiftBucket (Phase B), never derived from filename, so two entries
// that happen to share a name are never confused when removing one of them.
export function renderFileList(container, entries, { onRemove } = {}) {
  container.innerHTML = "";

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "file-list-empty";
    empty.textContent = t("import.noFilesSelected");
    container.appendChild(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "file-list";

  entries.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "file-list-item";

    const name = document.createElement("span");
    name.className = "file-list-name";
    name.textContent = entry.file.name;
    item.appendChild(name);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "file-remove-btn";
    removeBtn.setAttribute("aria-label", t("import.removeFile", { filename: entry.file.name }));
    removeBtn.title = t("import.removeFileTitle", { filename: entry.file.name });
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      if (onRemove) onRemove(entry.id);
    });
    item.appendChild(removeBtn);

    list.appendChild(item);
  });

  container.appendChild(list);
}
