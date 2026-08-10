// Copyright (c) 2026 AI anime

export async function writeTextToClipboard(value: string): Promise<void> {
  const desktopClipboard = window.aiAnimeDesktop?.clipboard;
  if (desktopClipboard) {
    await desktopClipboard.writeText(value);
    return;
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
  }
  if (!copied) throw new Error("clipboard is unavailable");
}
