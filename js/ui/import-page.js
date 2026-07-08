import { createShiftBucket } from "./shift-bucket.js";

export function mountImportPage(container, { onFilesChange } = {}) {
  let dayFiles = [];
  let nightFiles = [];

  function emitChange() {
    if (!onFilesChange) return;
    const bucketedFiles = [
      ...dayFiles.map((file) => ({ file, bucket: "DS" })),
      ...nightFiles.map((file) => ({ file, bucket: "NS" })),
    ];
    onFilesChange(bucketedFiles);
  }

  const bucketsRow = document.createElement("div");
  bucketsRow.className = "shift-buckets-row";

  const dayShiftBucket = createShiftBucket({
    id: "day-shift-bucket",
    label: "Day Shift Input",
    hint: "Accepts HYNC, SLNC, ESG Day Shift source files.",
    bucketId: "DS",
    onChange: (_bucketId, files) => {
      dayFiles = files;
      emitChange();
    },
  });

  const nightShiftBucket = createShiftBucket({
    id: "night-shift-bucket",
    label: "Night Shift Input",
    hint: "Accepts HYNC, SLNC, ESG Night Shift source files.",
    bucketId: "NS",
    onChange: (_bucketId, files) => {
      nightFiles = files;
      emitChange();
    },
  });

  bucketsRow.appendChild(dayShiftBucket.element);
  bucketsRow.appendChild(nightShiftBucket.element);

  container.appendChild(bucketsRow);

  return {
    getDayShiftFiles: dayShiftBucket.getFiles,
    getNightShiftFiles: nightShiftBucket.getFiles,
    reset: () => {
      dayShiftBucket.reset();
      nightShiftBucket.reset();
    },
  };
}
