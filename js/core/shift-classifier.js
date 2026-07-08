let shiftRulesCache = null;

export async function loadShiftRules() {
  if (shiftRulesCache) return shiftRulesCache;
  const response = await fetch("./config/shift-rules.json");
  shiftRulesCache = await response.json();
  return shiftRulesCache;
}

function parseTimeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function classifyShift(date, profileId, shiftRules) {
  const rule = shiftRules[profileId];
  if (!rule) return "UNKNOWN";

  const startMinutes = parseTimeToMinutes(rule.dayShiftStart);
  const endMinutes = parseTimeToMinutes(rule.dayShiftEnd);
  const rowMinutes = date.getHours() * 60 + date.getMinutes();

  return rowMinutes >= startMinutes && rowMinutes < endMinutes ? "DS" : "NS";
}
