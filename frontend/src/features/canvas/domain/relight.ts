// Copyright (c) 2026 AI anime
export type CanvasRelightKeyLightDirection =
  | "left"
  | "top"
  | "right"
  | "front"
  | "bottom"
  | "back";

const CANVAS_RELIGHT_KEY_LIGHT_DIRECTIONS: readonly CanvasRelightKeyLightDirection[] =
  ["left", "top", "right", "front", "bottom", "back"];

export function resolveCanvasRelightKeyLightDirection(
  candidate: string | null,
): CanvasRelightKeyLightDirection {
  if (
    candidate &&
    (CANVAS_RELIGHT_KEY_LIGHT_DIRECTIONS as readonly string[]).includes(
      candidate,
    )
  ) {
    return candidate as CanvasRelightKeyLightDirection;
  }
  return "front";
}

export interface CanvasRelightSmartPrompt {
  readonly enabled: boolean;
  readonly prompt: string;
  readonly presetPrompt: string | null;
}

export function buildCanvasRelightPrompt(
  smartMode: CanvasRelightSmartPrompt,
): string {
  if (!smartMode.enabled) return "";
  const parts: string[] = [];
  if (smartMode.prompt) parts.push(smartMode.prompt);
  if (smartMode.presetPrompt) parts.push(smartMode.presetPrompt);
  return parts.join("\n");
}
