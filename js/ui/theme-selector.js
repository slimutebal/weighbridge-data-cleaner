const STORAGE_KEY = "weighbridge.themeMode.v1";
const VALID_MODES = ["auto", "light", "dark"];

// Placeholder control only (v0.2.0-prepilot revision 4): persists the
// operator's choice so it's ready to read once full theme styling exists,
// but does not itself apply any dark/light styling or touch existing layout.
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

  select.addEventListener("change", () => {
    storeThemeMode(select.value);
  });

  wrap.appendChild(label);
  wrap.appendChild(select);
  container.appendChild(wrap);

  return {};
}
