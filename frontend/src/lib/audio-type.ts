// Copyright (c) 2026 AI anime
const LABELS: Record<string, string> = {
  narration: "旁白",
  dialogue: "对白",
};

export function audioTypeLabel(type: string | null | undefined): string {
  if (!type) return "";
  return LABELS[type] ?? type;
}
