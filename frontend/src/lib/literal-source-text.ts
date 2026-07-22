// Copyright (c) 2026 AI anime
export function splitLiteralSourceText(sourceText: string): string[] {
  return sourceText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
