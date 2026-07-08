export function renderFileList(container, files) {
  container.innerHTML = "";

  if (!files.length) {
    const empty = document.createElement("p");
    empty.className = "file-list-empty";
    empty.textContent = "No files selected.";
    container.appendChild(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "file-list";

  files.forEach((file) => {
    const item = document.createElement("li");
    item.className = "file-list-item";
    item.textContent = file.name;
    list.appendChild(item);
  });

  container.appendChild(list);
}
