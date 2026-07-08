const STORAGE_KEY = "weighbridge.themeMode.v1";
const VALID_MODES = ["auto", "light", "dark"];

export function loadStoredThemeMode() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return VALID_MODES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

function storeThemeMode(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Persistence is best-effort only.
  }
}

// Sets data-theme on <html>, which css/app.css keys its CSS variable
// palettes off (:root[data-theme="dark"], and a prefers-color-scheme media
// query scoped to :root[data-theme="auto"]) — applies immediately, no
// reload needed, since it's a plain attribute + CSS cascade, not a
// stylesheet swap.
export function applyThemeMode(value) {
  const mode = VALID_MODES.includes(value) ? value : "auto";
  document.documentElement.dataset.theme = mode;
}

export function mountThemeSelector(container, { initialValue = "auto" } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "theme-mode-selector";

  const label = document.createElement("label");
  label.setAttribute("for", "theme-mode-select");
  label.textContent = "Theme:";

  const select = document.createElement("select");
  select.id = "theme-mode-select";

  [
    { value: "auto", label: "Auto" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ].forEach(({ value, label: optionLabel }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = optionLabel;
    select.appendChild(option);
  });

  select.value = VALID_MODES.includes(initialValue) ? initialValue : "auto";
  applyThemeMode(select.value);

  select.addEventListener("change", () => {
    storeThemeMode(select.value);
    applyThemeMode(select.value);
  });

  wrap.appendChild(label);
  wrap.appendChild(select);
  container.appendChild(wrap);

  return {};
}
