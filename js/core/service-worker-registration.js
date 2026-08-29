// OFFLINE-2 Service Worker registration bootstrap.
//
// Registration is entirely best-effort and non-blocking: it is
// feature-detected, called after normal application bootstrap, and its
// success/failure never gates cleaning startup or any other business
// state. Nothing here caches, precaches, or alters application data —
// the actual app-shell caching strategy lives entirely in
// ./service-worker.js.
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // Registration itself requires a secure context (https:, or the
  // http://localhost / http://127.0.0.1 exception browsers already grant
  // for local development) — on any other origin, .register() rejects on
  // its own and the catch below swallows it, exactly like any other
  // registration failure.
  navigator.serviceWorker.register("./service-worker.js").catch((error) => {
    console.warn("Service worker registration failed (non-blocking):", error);
  });
}
