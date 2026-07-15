// Horizontal scroll-edge indicators (Phase C2, restructured v1.2.0 §16).
// A small reusable helper that overlays subtle, non-interactive left/right
// fade shadows on a horizontally scrollable element, so an operator can
// tell at a glance that a wide table has more columns off-screen. Native
// browser APIs only (scrollLeft/scrollWidth/clientWidth, ResizeObserver,
// rAF) — no MutationObserver, no external library.
//
// v1.2.0 fix: the shadow overlays must stay fixed to the scrollable
// element's own *viewport* (the fixed-size box the operator actually
// sees), not scroll along with its content. The previous implementation
// appended the shadow divs as children of the very element that has
// overflow-x: auto — even absolutely positioned, a child of the
// scrolling element is still part of what that element scrolls, so the
// "fixed" right-edge shadow visibly slid along with the table's columns
// as soon as the operator scrolled. The fix wraps the scrollable element
// in a non-scrolling shell (position: relative; overflow: hidden) and
// attaches the shadows to that shell instead — a sibling of the
// scrolling content, not a descendant of it — so they read the same
// scroll position via scrollLeft/scrollWidth/clientWidth on the inner
// element but are never themselves moved by that scroll.
//
// Callers own the lifecycle: attachScrollEdgeIndicators(element) returns a
// cleanup() function that must be called before the element is discarded
// (e.g. at the top of the next render pass, before container.innerHTML is
// reset) — this module never guesses when a caller is "done" with an
// element, so it never leaks a ResizeObserver/listener on its own.

const EPSILON = 1;

export function attachScrollEdgeIndicators(element) {
  if (!element) return () => {};

  const parent = element.parentNode;
  const nextSibling = element.nextSibling;

  const shell = document.createElement("div");
  shell.className = "scroll-shadow-shell";

  if (parent) {
    parent.insertBefore(shell, nextSibling);
  }
  shell.appendChild(element);
  element.classList.add("scroll-shadow-scroll");

  const leftShadow = document.createElement("div");
  leftShadow.className = "scroll-shadow scroll-shadow-left";
  leftShadow.setAttribute("aria-hidden", "true");

  const rightShadow = document.createElement("div");
  rightShadow.className = "scroll-shadow scroll-shadow-right";
  rightShadow.setAttribute("aria-hidden", "true");

  // Shadows are siblings of `element` within `shell` — never children of
  // `element` itself — so scrolling `element`'s content can never move
  // them (§16).
  shell.appendChild(leftShadow);
  shell.appendChild(rightShadow);

  function update() {
    const { scrollLeft, scrollWidth, clientWidth } = element;
    const hasOverflow = scrollWidth - clientWidth > EPSILON;
    // Minor browser sub-pixel rounding means scrollLeft + clientWidth can
    // land a fraction short of scrollWidth even at the true scroll end —
    // the -1 EPSILON absorbs that instead of leaving a permanently "stuck"
    // right shadow (§16 suggested condition).
    const canScrollLeft = scrollLeft > EPSILON;
    const canScrollRight = scrollLeft + clientWidth < scrollWidth - EPSILON;

    leftShadow.style.opacity = hasOverflow && canScrollLeft ? "1" : "0";
    rightShadow.style.opacity = hasOverflow && canScrollRight ? "1" : "0";
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
    leftShadow.remove();
    rightShadow.remove();
    element.classList.remove("scroll-shadow-scroll");
    // Unwrap: restore `element` to exactly where it was before the shell
    // was inserted, then discard the now-empty shell. In every real call
    // site the caller's own container.innerHTML reset already destroys
    // this whole subtree moments later, but reversing the wrap here keeps
    // this module correct even for a caller that keeps the container
    // around and only wants the indicators gone.
    if (shell.parentNode) {
      shell.parentNode.insertBefore(element, shell);
      shell.remove();
    }
  };
}
