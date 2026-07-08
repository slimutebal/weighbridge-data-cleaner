export function parseCellDateTime(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number") {
    const utcDays = Math.floor(value - 25569);
    const utcMilliseconds = utcDays * 86400 * 1000;
    const dateInfo = new Date(utcMilliseconds);

    const fractionalDay = value - Math.floor(value);
    let totalSeconds = Math.round(fractionalDay * 86400);
    const seconds = totalSeconds % 60;
    totalSeconds -= seconds;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds / 60) % 60;

    return new Date(
      dateInfo.getUTCFullYear(),
      dateInfo.getUTCMonth(),
      dateInfo.getUTCDate(),
      hours,
      minutes,
      seconds
    );
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const fullYearMatch = trimmed.match(
      /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T]?(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?$/
    );
    if (fullYearMatch) {
      const [, y, mo, d, h = "0", mi = "0", s = "0"] = fullYearMatch;
      return new Date(
        Number(y),
        Number(mo) - 1,
        Number(d),
        Number(h),
        Number(mi),
        Number(s)
      );
    }

    // Two-digit year, e.g. ESG's "26-05-16 07:54" (YY-MM-DD HH:mm).
    const shortYearMatch = trimmed.match(
      /^(\d{2})[-/](\d{1,2})[-/](\d{1,2})[ T]?(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?$/
    );
    if (shortYearMatch) {
      const [, yy, mo, d, h = "0", mi = "0", s = "0"] = shortYearMatch;
      return new Date(
        2000 + Number(yy),
        Number(mo) - 1,
        Number(d),
        Number(h),
        Number(mi),
        Number(s)
      );
    }

    const timeOnlyMatch = trimmed.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (timeOnlyMatch) {
      const [, h, mi, s = "0"] = timeOnlyMatch;
      return new Date(1899, 11, 30, Number(h), Number(mi), Number(s));
    }

    const direct = new Date(trimmed.replace(" ", "T"));
    if (!isNaN(direct.getTime())) return direct;

    return null;
  }

  return null;
}

export function combineDateAndTime(dateRaw, timeRaw) {
  const timeParsed = parseCellDateTime(timeRaw);
  if (!timeParsed) return null;

  const looksTimeOnly = timeParsed.getFullYear() <= 1899;
  if (!looksTimeOnly) return timeParsed;

  const dateParsed = parseCellDateTime(dateRaw);
  if (!dateParsed) return null;

  return new Date(
    dateParsed.getFullYear(),
    dateParsed.getMonth(),
    dateParsed.getDate(),
    timeParsed.getHours(),
    timeParsed.getMinutes(),
    timeParsed.getSeconds()
  );
}

export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
