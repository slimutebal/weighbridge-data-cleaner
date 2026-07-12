import { announce } from "./live-announcer.js";

export async function copyToClipboard(text, button) {
  const originalText = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied!";
    announce("Data copied to clipboard.");
  } catch (error) {
    console.error("Clipboard copy failed:", error);
    button.textContent = "Copy failed";
    announce("Copy failed.");
  }
  setTimeout(() => {
    button.textContent = originalText;
  }, 1500);
}
