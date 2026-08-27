// Settings dialog (Phase C1): a native <dialog> singleton, following the
// same lazy-create-once pattern as view-all-modal.js / wrong-bucket-modal.js
// — appended to document.body on first open, reused (innerHTML rebuilt) on
// every later open or language change, never duplicated.
import { getLanguage, setLanguage, t, subscribeLanguage } from "./i18n.js";
import { mountThemeSelector, loadStoredThemeMode } from "./theme-selector.js";

let dialogEl = null;
let lastTrigger = null;
let titleEl = null;

function ensureDialog() {
  if (dialogEl) return dialogEl;

  dialogEl = document.createElement("dialog");
  dialogEl.className = "secondary-dialog settings-modal";
  dialogEl.setAttribute("aria-labelledby", "settings-dialog-title");
  document.body.appendChild(dialogEl);

  // Native <dialog> handles Escape-to-close and focus trapping; this only
  // adds returning focus to the Settings trigger button, matching the same
  // pattern already used by view-all-modal.js.
  dialogEl.addEventListener("close", () => {
    if (lastTrigger) lastTrigger.focus();
  });

  buildContent();
  return dialogEl;
}

function buildContent() {
  dialogEl.innerHTML = "";

  const header = document.createElement("div");
  header.className = "settings-header";

  titleEl = document.createElement("h3");
  titleEl.id = "settings-dialog-title";
  titleEl.textContent = t("settings.title");
  header.appendChild(titleEl);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn-secondary";
  closeBtn.textContent = t("common.close");
  closeBtn.addEventListener("click", () => dialogEl.close());
  header.appendChild(closeBtn);

  dialogEl.appendChild(header);

  // --- Language ---------------------------------------------------------
  const langSection = document.createElement("div");
  langSection.className = "settings-section";

  const langHeading = document.createElement("h4");
  langHeading.textContent = t("settings.language");
  langSection.appendChild(langHeading);

  const langGroup = document.createElement("div");
  langGroup.className = "settings-radio-group";
  langGroup.setAttribute("role", "radiogroup");
  langGroup.setAttribute("aria-label", t("settings.language"));

  [
    { value: "en", labelKey: "language.english" },
    { value: "id", labelKey: "language.indonesian" },
  ].forEach(({ value, labelKey }) => {
    const optionId = `settings-lang-${value}`;

    const option = document.createElement("label");
    option.className = "settings-radio-option";
    option.setAttribute("for", optionId);

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "settings-language";
    input.id = optionId;
    input.value = value;
    input.checked = getLanguage() === value;
    input.addEventListener("change", () => {
      if (input.checked) setLanguage(value);
    });

    const text = document.createElement("span");
    text.textContent = t(labelKey);

    option.appendChild(input);
    option.appendChild(text);
    langGroup.appendChild(option);
  });

  langSection.appendChild(langGroup);
  dialogEl.appendChild(langSection);

  // --- Theme --------------------------------------------------------------
  // Reuses the existing theme-selector module (single source of theme
  // state/localStorage/applyThemeMode) rather than a second independent
  // theme state — this dialog is fully rebuilt on every language change, so
  // the theme <select> is always remounted fresh reading the current
  // persisted value, never losing the user's choice.
  const themeSection = document.createElement("div");
  themeSection.className = "settings-section";

  const themeHeading = document.createElement("h4");
  themeHeading.textContent = t("settings.theme");
  themeSection.appendChild(themeHeading);

  const themeContainer = document.createElement("div");
  themeSection.appendChild(themeContainer);
  mountThemeSelector(themeContainer, { initialValue: loadStoredThemeMode() || "auto" });

  dialogEl.appendChild(themeSection);
}

// Keeps the dialog's own text current even while closed, so it never shows
// stale-language content the next time it's opened. Rebuilding only touches
// dialogEl's children (innerHTML), never dialogEl itself, so its `open`
// state/attribute (and the one registered `close` listener) survive.
subscribeLanguage(() => {
  if (dialogEl) buildContent();
});

export function mountSettingsTrigger(container) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "settings-trigger-btn";
  btn.className = "btn-secondary settings-trigger-btn";
  btn.textContent = t("settings.title");
  btn.addEventListener("click", () => {
    lastTrigger = btn;
    ensureDialog().showModal();
  });

  subscribeLanguage(() => {
    btn.textContent = t("settings.title");
  });

  container.appendChild(btn);
  return { button: btn };
}
