import { mountImportPage } from "./ui/import-page.js";
import { mountResultPage } from "./ui/result-page.js";
import { mountListDtPage } from "./ui/list-dt-page.js";
import { mountDecimalFormatSelector } from "./ui/decimal-format-selector.js";
import { runCleaning } from "./core/cleaning-orchestrator.js";
import { loadAppConfig } from "./core/app-settings.js";
import { resolveDecimalSeparator } from "./core/output-formatter.js";
import { loadStoredDecimalSeparator, storeDecimalSeparator } from "./core/decimal-preference.js";

const appConfig = await loadAppConfig();
// The user's own choice (persisted in localStorage) always overrides the
// config/app-config.json default; the config default only applies the very
// first time the app runs on a given browser.
const decimalSeparator =
  loadStoredDecimalSeparator() || resolveDecimalSeparator(appConfig.decimalSeparator);

const decimalFormatContainer = document.getElementById("decimal-format-page");
const listDtContainer = document.getElementById("list-dt-page");
const importContainer = document.getElementById("import-page");
const resultContainer = document.getElementById("result-page");
const resetBtn = document.getElementById("reset-btn");

const resultPage = mountResultPage(resultContainer, {
  decimalSeparator,
  listDtEndpoint: appConfig.listDtEndpoint,
  onRecleanRequested: () => handleFilesChange(lastBucketedFiles),
});

mountDecimalFormatSelector(decimalFormatContainer, {
  initialValue: decimalSeparator,
  onChange: (value) => {
    storeDecimalSeparator(value);
    resultPage.setDecimalSeparator(value);
  },
});

let lastBucketedFiles = [];

async function handleFilesChange(bucketedFiles) {
  lastBucketedFiles = bucketedFiles;
  resultPage.setHasFiles(bucketedFiles.length > 0);

  if (!bucketedFiles.length) {
    resultPage.showGroups({ groups: [], warnings: [], fileErrors: [], listDtInfo: null });
    return;
  }

  try {
    const result = await runCleaning(bucketedFiles);
    resultPage.showGroups(result);
  } catch (error) {
    console.error("Cleaning failed:", error);
    resultPage.showGroups({
      groups: [],
      warnings: [],
      fileErrors: [{ fileName: "(all files)", message: error.message }],
      listDtInfo: null,
    });
  }
}

const importPage = mountImportPage(importContainer, {
  onFilesChange: handleFilesChange,
});

mountListDtPage(listDtContainer, {
  onUpdated: async () => {
    if (lastBucketedFiles.length) {
      await handleFilesChange(lastBucketedFiles);
    }
  },
});

resetBtn.addEventListener("click", () => {
  importPage.reset();
  resultPage.reset();
  lastBucketedFiles = [];
});

console.log("Weighbridge Data Cleaner UI shell loaded.");
