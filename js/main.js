import { mountImportPage } from "./ui/import-page.js";
import { mountResultPage } from "./ui/result-page.js";
import { mountListDtPage } from "./ui/list-dt-page.js";
import { mountDecimalFormatSelector } from "./ui/decimal-format-selector.js";
import { mountMainPageNav, MAIN_PAGE } from "./ui/main-page-nav.js";
import { mountCleaningOverviewPage } from "./ui/cleaning-overview-page.js";
import { runCleaning } from "./core/cleaning-orchestrator.js";
import { loadAppConfig } from "./core/app-settings.js";
import { resolveDecimalSeparator } from "./core/output-formatter.js";
import { loadStoredDecimalSeparator, storeDecimalSeparator } from "./core/decimal-preference.js";
import { mountLiveRegion, announce } from "./ui/live-announcer.js";
import { initializeLanguage, t, subscribeLanguage } from "./ui/i18n.js";

// One persistent aria-live region for the whole app (Phase B) — mounted
// once here, before any other UI, so every module below can safely import
// announce() without worrying about mount order.
mountLiveRegion();

// Reads the persisted language choice (default English) and applies
// <html lang> before any UI below renders its first text (Phase C1).
initializeLanguage();

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
const actionBarContainer = document.getElementById("bottom-action-bar-container");
const resetBtn = document.getElementById("reset-btn");
const mainPageNavContainer = document.getElementById("main-page-nav");
const pageInputOverview = document.getElementById("page-input-overview");
const pageResults = document.getElementById("page-results");
const cleaningOverviewContainer = document.getElementById("cleaning-overview-page");
const page1TitleEl = document.getElementById("page1-title");
const page1SubtitleEl = document.getElementById("page1-subtitle");

const resultPage = mountResultPage(resultContainer, {
  decimalSeparator,
  listDtEndpoint: appConfig.listDtEndpoint,
  onRecleanRequested: () => handleFilesChange(lastBucketedFiles),
  actionBarContainer,
});

// Main Page 1 <-> Main Page 2 navigation (UI-5A). Presentation state only —
// switching pages never clears files/results/List DT/approval state, never
// starts a new cleaning run, and only toggles which page container is
// visible plus tells result-page.js whether Results is the active main
// page (used solely to keep "Copy This Profile" from reading as an active
// Page 1 action, see result-page.js's setMainPageActive).
function switchToPage(page) {
  pageInputOverview.classList.toggle("is-hidden", page !== MAIN_PAGE.INPUT_OVERVIEW);
  pageResults.classList.toggle("is-hidden", page !== MAIN_PAGE.RESULTS);
  resultPage.setMainPageActive(page === MAIN_PAGE.RESULTS);
}

const mainPageNav = mountMainPageNav(mainPageNavContainer, {
  onNavigate: (page) => switchToPage(page),
});

// Page 1's Cleaning Overview (UI-5A) — a decision/navigation surface fed
// from the exact same cleaning result as the legacy Results Overview tab
// (currentResult in result-page.js); it never recomputes readiness or
// grouping itself.
const cleaningOverviewPage = mountCleaningOverviewPage(cleaningOverviewContainer, {
  decimalSeparator,
  onOpenGroup: (profileId, groupKey) => {
    mainPageNav.setActivePage(MAIN_PAGE.RESULTS);
    switchToPage(MAIN_PAGE.RESULTS);
    resultPage.openGroup(profileId, groupKey);
  },
});

mountDecimalFormatSelector(decimalFormatContainer, {
  initialValue: decimalSeparator,
  onChange: (value) => {
    storeDecimalSeparator(value);
    resultPage.setDecimalSeparator(value);
    cleaningOverviewPage.setDecimalSeparator(value);
  },
});

switchToPage(MAIN_PAGE.INPUT_OVERVIEW);

page1TitleEl.textContent = t("page1.title");
page1SubtitleEl.textContent = t("page1.subtitle");
subscribeLanguage(() => {
  page1TitleEl.textContent = t("page1.title");
  page1SubtitleEl.textContent = t("page1.subtitle");
});

let lastBucketedFiles = [];

// Monotonically increasing cleaning generation token. Every call to
// handleFilesChange (a new upload, a per-file removal, Reset, or a
// re-clean request) captures its own runId; a stale in-flight
// runCleaning() promise that resolves or rejects after a *newer* call has
// already started is detected via runId !== cleaningRunId and discarded
// instead of overwriting the newer (possibly empty, post-Reset) state.
// Promises themselves are never cancelled — only their late results are
// rejected by generation.
let cleaningRunId = 0;

async function handleFilesChange(bucketedFiles) {
  const runId = ++cleaningRunId;

  lastBucketedFiles = bucketedFiles;
  resultPage.setHasFiles(bucketedFiles.length > 0);

  if (!bucketedFiles.length) {
    const emptyResult = { groups: [], warnings: [], fileErrors: [], listDtInfo: null };
    resultPage.showGroups(emptyResult);
    cleaningOverviewPage.showResult(emptyResult);
    mainPageNav.setResultsEnabled(false);
    return;
  }

  cleaningOverviewPage.setProcessing(true);

  try {
    const result = await runCleaning(bucketedFiles);
    if (runId !== cleaningRunId) return;
    resultPage.showGroups(result);
    cleaningOverviewPage.showResult(result);
    mainPageNav.setResultsEnabled((result.groups || []).length > 0);
  } catch (error) {
    if (runId !== cleaningRunId) return;
    console.error("Cleaning failed:", error);
    const errorResult = {
      groups: [],
      warnings: [],
      fileErrors: [{ fileName: "(all files)", message: error.message }],
      listDtInfo: null,
    };
    resultPage.showGroups(errorResult);
    cleaningOverviewPage.showResult(errorResult);
    mainPageNav.setResultsEnabled(false);
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

resetBtn.textContent = t("header.clearReset");
subscribeLanguage(() => {
  resetBtn.textContent = t("header.clearReset");
});

resetBtn.addEventListener("click", () => {
  importPage.reset();
  resultPage.reset();
  cleaningOverviewPage.reset();
  mainPageNav.setResultsEnabled(false);
  lastBucketedFiles = [];
  announce(t("header.allCleared"));
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

// Keeps --bottom-action-bar-height in sync with the bottom action dock's
// actual rendered height (Phase B), mirroring the header measurement
// above — button wrapping, safe-area insets, zoom, and narrowed windows
// can all change that height, so #app's bottom clearance (css/app.css)
// must track it rather than keep a hardcoded guessed value that risks the
// dock covering the last bit of content. actionBarContainer is the outer
// fixed wrapper (#bottom-action-bar-container, static in index.html,
// never re-rendered) — observing it, rather than the inner dock that
// action-bar.js builds, means this observer never needs to be
// re-attached across re-renders.
function updateBottomActionBarHeight() {
  document.documentElement.style.setProperty(
    "--bottom-action-bar-height",
    `${actionBarContainer.offsetHeight}px`
  );
}

if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(updateBottomActionBarHeight).observe(actionBarContainer);
} else {
  window.addEventListener("resize", updateBottomActionBarHeight);
}
updateBottomActionBarHeight();

console.log("Weighbridge Data Cleaner UI shell loaded.");
