import { createShiftBucket } from "./shift-bucket.js";
import { t } from "./i18n.js";

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
    labelKey: "import.dayShift",
    hintKey: "import.dayHint",
    bucketId: "DS",
    onChange: (_bucketId, files) => {
      dayFiles = files;
      emitChange();
    },
  });

  const nightShiftBucket = createShiftBucket({
    id: "night-shift-bucket",
    labelKey: "import.nightShift",
    hintKey: "import.nightHint",
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
    // Atomic global reset: both buckets are cleared silently (no
    // intermediate notifyChange from either one), local state is
    // resynced directly from each now-empty bucket, and exactly one
    // combined empty-file update is emitted — so Clear/Reset can never
    // kick off a new cleaning run against whichever bucket happened to
    // still hold files at the moment the other bucket was reset.
    reset: () => {
      dayShiftBucket.reset({ notify: false });
      nightShiftBucket.reset({ notify: false });
      dayFiles = dayShiftBucket.getFiles();
      nightFiles = nightShiftBucket.getFiles();
      emitChange();
    },
  };
}
