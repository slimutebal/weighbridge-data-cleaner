const STORAGE_KEY = "weighbridge.decimalSeparator.v1";

export function loadStoredDecimalSeparator() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "." || value === "," ? value : null;
  } catch {
    return null;
  }
}

export function storeDecimalSeparator(value) {
  if (value !== "." && value !== ",") return;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Persisting the preference is best-effort only.
  }
}
