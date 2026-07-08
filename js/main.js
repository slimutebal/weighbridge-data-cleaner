import { mountImportPage } from "./ui/import-page.js";
import { mountResultPage } from "./ui/result-page.js";
import { mountListDtPage } from "./ui/list-dt-page.js";
import { mountDecimalFormatSelector } from "./ui/decimal-format-selector.js";
import { mountThemeSelector, loadStoredThemeMode } from "./ui/theme-selector.js";
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
const themeModeContainer = document.getElementById("theme-mode-page");
const listDtContainer = document.getElementById("list-dt-page");
const importContainer = document.getElementById("import-page");
const resultContainer = document.getElementById("result-page");
const actionBarContainer = document.getElementById("bottom-action-bar-container");
const resetBtn = document.getElementById("reset-btn");

const resultPage = mountResultPage(resultContainer, {
  decimalSeparator,
  listDtEndpoint: appConfig.listDtEndpoint,
  onRecleanRequested: () => handleFilesChange(lastBucketedFiles),
  actionBarContainer,
});

mountDecimalFormatSelector(decimalFormatContainer, {
  initialValue: decimalSeparator,
  onChange: (value) => {
    storeDecimalSeparator(value);
    resultPage.setDecimalSeparator(value);
  },
});

mountThemeSelector(themeModeContainer, {
  initialValue: loadStoredThemeMode() || "auto",
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

// Keeps --sticky-header-height in sync with the app header's actual
// rendered height (v0.2.0-prepilot revision 7), rather than hardcoding a
// guessed pixel value in CSS — the header's height can change from
// control wrapping at narrow widths, browser zoom, or future header
// changes. The sticky result tab bar (css/app.css) reads this variable
// for its own `top` offset so it always sits flush below the header.
const appHeader = document.getElementById("app-header");

function updateStickyHeaderHeight() {
  document.documentElement.style.setProperty(
    "--sticky-header-height",
    `${appHeader.offsetHeight}px`
  );
}

if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(updateStickyHeaderHeight).observe(appHeader);
} else {
  window.addEventListener("resize", updateStickyHeaderHeight);
}
updateStickyHeaderHeight();

console.log("Weighbridge Data Cleaner UI shell loaded.");
