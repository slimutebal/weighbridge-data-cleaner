// Top-level Main Page navigation (UI-5A): a small explicit UI-only state
// machine switching between Main Page 1 (Input & Overview) and Main Page 2
// (Results) — presentation state only, never business state. main.js owns
// actually toggling the two page containers' visibility and reset/
// re-cleaning is never triggered from here; this module only renders the
// nav control and tracks which page is "active" for its own button
// styling/aria-current.
import { t, subscribeLanguage } from "./i18n.js";

export const MAIN_PAGE = {
  INPUT_OVERVIEW: "input-overview",
  RESULTS: "results",
};

export function mountMainPageNav(container, { onNavigate } = {}) {
  let activePage = MAIN_PAGE.INPUT_OVERVIEW;
  let resultsEnabled = false;

  const nav = document.createElement("div");
  nav.className = "main-page-nav";

  const inputBtn = document.createElement("button");
  inputBtn.type = "button";
  inputBtn.className = "main-page-nav-btn";

  const resultsBtn = document.createElement("button");
  resultsBtn.type = "button";
  resultsBtn.className = "main-page-nav-btn";

  function render() {
    inputBtn.textContent = t("page1.title");
    resultsBtn.textContent = t("nav.results");

    inputBtn.setAttribute("aria-current", activePage === MAIN_PAGE.INPUT_OVERVIEW ? "page" : "false");
    resultsBtn.setAttribute("aria-current", activePage === MAIN_PAGE.RESULTS ? "page" : "false");

    inputBtn.classList.toggle("main-page-nav-btn-active", activePage === MAIN_PAGE.INPUT_OVERVIEW);
    resultsBtn.classList.toggle("main-page-nav-btn-active", activePage === MAIN_PAGE.RESULTS);

    resultsBtn.disabled = !resultsEnabled;
    resultsBtn.title = resultsEnabled ? "" : t("nav.resultsUnavailable");
  }

  inputBtn.addEventListener("click", () => {
    if (activePage === MAIN_PAGE.INPUT_OVERVIEW) return;
    activePage = MAIN_PAGE.INPUT_OVERVIEW;
    render();
    if (onNavigate) onNavigate(activePage);
  });

  resultsBtn.addEventListener("click", () => {
    if (!resultsEnabled || activePage === MAIN_PAGE.RESULTS) return;
    activePage = MAIN_PAGE.RESULTS;
    render();
    if (onNavigate) onNavigate(activePage);
  });

  nav.appendChild(inputBtn);
  nav.appendChild(resultsBtn);
  container.appendChild(nav);

  subscribeLanguage(render);
  render();

  return {
    // Setting this false while Results is the active page never force-
    // navigates away on its own (section 19 of the UI-5A brief only
    // requires Results to be "disabled or otherwise clearly unavailable"
    // when there are no results) — it only disables re-entry via this
    // button, so an operator mid-review is never unexpectedly bounced.
    setResultsEnabled(enabled) {
      resultsEnabled = Boolean(enabled);
      render();
    },
    // Lets a caller (a contextual "View Results"/"Review Issues" action)
    // mark Results active without going through the click handler above.
    setActivePage(page) {
      activePage = page === MAIN_PAGE.RESULTS ? MAIN_PAGE.RESULTS : MAIN_PAGE.INPUT_OVERVIEW;
      render();
    },
    getActivePage: () => activePage,
  };
}
