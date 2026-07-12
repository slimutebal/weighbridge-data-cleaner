// Central accessibility announcement mechanism (Phase B). One persistent,
// visually-hidden live region mounted once at application startup —
// supplements existing visible feedback (button text, status chips,
// warning/validation blocks); it never replaces any of that, and never
// carries raw internal errors, ids, or stack traces.
let liveRegionEl = null;
let clearTimer = null;

export function mountLiveRegion() {
  if (liveRegionEl) return liveRegionEl;

  liveRegionEl = document.createElement("div");
  liveRegionEl.id = "app-live-region";
  liveRegionEl.className = "visually-hidden";
  liveRegionEl.setAttribute("role", "status");
  liveRegionEl.setAttribute("aria-live", "polite");
  liveRegionEl.setAttribute("aria-atomic", "true");
  document.body.appendChild(liveRegionEl);

  return liveRegionEl;
}

// Clears the region first, then sets the message a short delay later — so
// two identical messages in a row (e.g. copying twice, removing two files
// with the same name) still produce a fresh DOM mutation each time. Setting
// the same text twice in place is otherwise a no-op mutation that most
// screen readers silently ignore.
export function announce(message) {
  const region = liveRegionEl || mountLiveRegion();

  if (clearTimer) clearTimeout(clearTimer);
  region.textContent = "";

  clearTimer = setTimeout(() => {
    region.textContent = message;
    clearTimer = null;
  }, 50);
}
