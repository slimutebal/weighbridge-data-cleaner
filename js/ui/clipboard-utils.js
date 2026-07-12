import { announce } from "./live-announcer.js";
import { t } from "./i18n.js";

export async function copyToClipboard(text, button) {
  const originalText = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = t("results.copied");
    announce(t("results.copiedAnnounce"));
  } catch (error) {
    console.error("Clipboard copy failed:", error);
    button.textContent = t("results.copyFailed");
    announce(t("results.copyFailedAnnounce"));
  }
  setTimeout(() => {
    button.textContent = originalText;
  }, 1500);
}
