export function formatDateOnly(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function detectAutoDecimalSeparator() {
  return (1.1).toLocaleString().includes(",") ? "," : ".";
}

export function resolveDecimalSeparator(setting) {
  if (setting === "." || setting === ",") return setting;
  return detectAutoDecimalSeparator();
}

export function formatDecimal(value, separator) {
  const num = Number(value);
  if (value === undefined || value === null || Number.isNaN(num)) return "";
  const fixed = num.toFixed(2);
  return separator === "," ? fixed.replace(".", ",") : fixed;
}

export function extractNumericGrade(rawGrade) {
  if (rawGrade === undefined || rawGrade === null) return null;
  const match = String(rawGrade).match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  return Number(match[0]);
}
