export async function copyToClipboard(text, button) {
  const originalText = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied!";
  } catch (error) {
    console.error("Clipboard copy failed:", error);
    button.textContent = "Copy failed";
  }
  setTimeout(() => {
    button.textContent = originalText;
  }, 1500);
}
