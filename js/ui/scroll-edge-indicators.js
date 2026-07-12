// Horizontal scroll-edge indicators (Phase C2) — a small reusable helper
// that overlays subtle, non-interactive left/right fade indicators on a
// horizontally scrollable element, so an operator can tell at a glance
// that a wide table has more columns off-screen. Native browser APIs only
// (scrollLeft/scrollWidth/clientWidth, ResizeObserver, rAF) — no MutationObserver,
// no external library.
//
// Callers own the lifecycle: attachScrollEdgeIndicators(element) returns a
// cleanup() function that must be called before the element is discarded
// (e.g. at the top of the next render pass, before container.innerHTML is
// reset) — this module never guesses when a caller is "done" with an
// element, so it never leaks a ResizeObserver/listener on its own.

const EPSILON = 1;

export function attachScrollEdgeIndicators(element) {
  if (!element) return () => {};

  // The two overlay strips are positioned relative to `element` itself, so
  // it needs to be a positioning context. Only forced when the caller
  // hasn't already made it one (harmless to set unconditionally to
  // "relative" otherwise).
  const previousPosition = element.style.position;
  if (!previousPosition && getComputedStyle(element).position === "static") {
    element.style.position = "relative";
  }
  element.classList.add("scroll-edge-container");

  const leftIndicator = document.createElement("div");
  leftIndicator.className = "scroll-edge-indicator scroll-edge-indicator-left";
  leftIndicator.setAttribute("aria-hidden", "true");

  const rightIndicator = document.createElement("div");
  rightIndicator.className = "scroll-edge-indicator scroll-edge-indicator-right";
  rightIndicator.setAttribute("aria-hidden", "true");

  element.appendChild(leftIndicator);
  element.appendChild(rightIndicator);

  function update() {
    const { scrollLeft, scrollWidth, clientWidth } = element;
    const hasOverflow = scrollWidth - clientWidth > EPSILON;
    const atLeftEdge = scrollLeft <= EPSILON;
    const atRightEdge = scrollLeft + clientWidth >= scrollWidth - EPSILON;

    leftIndicator.style.opacity = hasOverflow && !atLeftEdge ? "1" : "0";
    rightIndicator.style.opacity = hasOverflow && !atRightEdge ? "1" : "0";
  }

  element.addEventListener("scroll", update, { passive: true });

  let resizeObserver = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(element);
  } else {
    window.addEventListener("resize", update);
  }

  // Initial measurement after layout — scrollWidth/clientWidth are not
  // reliable until the browser has actually laid out this render pass.
  const rafId = requestAnimationFrame(update);

  return function cleanup() {
    cancelAnimationFrame(rafId);
    element.removeEventListener("scroll", update);
    if (resizeObserver) {
      resizeObserver.disconnect();
    } else {
      window.removeEventListener("resize", update);
    }
    leftIndicator.remove();
    rightIndicator.remove();
  };
}
