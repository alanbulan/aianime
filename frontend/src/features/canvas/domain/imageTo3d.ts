// Copyright (c) 2026 AI anime
import type { CanvasNode } from "./canvasNodes";

export const CANVAS_IMAGE_TO_3D_SOURCE_KINDS = [
  "master",
  "reverse",
  "pano",
] as const;
export type CanvasImageTo3dSourceKind =
  (typeof CANVAS_IMAGE_TO_3D_SOURCE_KINDS)[number];
export type CanvasImageTo3dVisibleSourceKind = Exclude<
  CanvasImageTo3dSourceKind,
  "reverse"
>;

export function resolveCanvasImageTo3dSourceKind(
  sourceNode: CanvasNode | null,
  visibleSourceKind: CanvasImageTo3dVisibleSourceKind,
): CanvasImageTo3dSourceKind {
  if (visibleSourceKind === "pano") return "pano";
  const data = sourceNode?.data as
    | { output_role?: unknown; __freezone_source?: unknown }
    | undefined;
  const outputRole =
    typeof data?.output_role === "string" ? data.output_role : "";
  const freezoneSource = data?.__freezone_source as
    | { role?: unknown }
    | undefined;
  const sourceRole =
    typeof freezoneSource?.role === "string" ? freezoneSource.role : "";
  return outputRole === "scene_reverse_master" ||
    sourceRole === "scene_reverse_master"
    ? "reverse"
    : "master";
}
