// Copyright (c) 2026 AI anime
import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from "./canvasNodes";

export type DropMediaType = "image" | "video" | "audio" | "model";

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function sourceRecordUrl(record: Record<string, unknown>): string | null {
  for (const key of ["url", "ply_url", "pano_url", "fs", "pano_fs"]) {
    const value = record[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

export function modelSourceUrlFromNodeData(
  data: Record<string, unknown>,
): string | null {
  const str = (key: string): string | null => stringValue(data[key]);
  const sources = Array.isArray(data.sources) ? data.sources : [];
  const records = sources.filter((source): source is Record<string, unknown> =>
    Boolean(source && typeof source === "object"),
  );
  const activeSourceId = str("activeSourceId");
  const activeSource = activeSourceId
    ? records.find((source) => source.id === activeSourceId)
    : undefined;
  return (
    (activeSource ? sourceRecordUrl(activeSource) : null) ??
    sourceRecordUrl(records.find((source) => source.current === true) ?? {}) ??
    sourceRecordUrl(records[0] ?? {}) ??
    str("plyUrl") ??
    str("modelUrl") ??
    str("fileUrl") ??
    str("panoUrl")
  );
}

export function deriveNodeDropInfo(node: CanvasNode): {
  mediaType: DropMediaType;
  sourceUrl: string | null;
  thumbUrl: string | null;
  label: string;
  directorControlBundle: Record<string, unknown> | null;
} | null {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const str = (key: string): string | null => stringValue(data[key]);
  const label = str("displayName") ?? str("sourceFileName") ?? "节点";
  const directorControlBundle =
    data.director_control_bundle && typeof data.director_control_bundle === "object"
      ? (data.director_control_bundle as Record<string, unknown>)
      : null;

  switch (node.type) {
    case CANVAS_NODE_TYPES.video:
      return {
        mediaType: "video",
        sourceUrl: str("videoUrl"),
        thumbUrl: str("previewImageUrl"),
        label,
        directorControlBundle,
      };
    case CANVAS_NODE_TYPES.audio:
      return {
        mediaType: "audio",
        sourceUrl: str("audioUrl"),
        thumbUrl: null,
        label,
        directorControlBundle,
      };
    case CANVAS_NODE_TYPES.threeDWorld:
      return {
        mediaType: "model",
        sourceUrl: modelSourceUrlFromNodeData(data),
        thumbUrl: str("previewImageUrl") ?? str("coverUrl"),
        label,
        directorControlBundle,
      };
    case CANVAS_NODE_TYPES.upload:
    case CANVAS_NODE_TYPES.imageEdit:
    case CANVAS_NODE_TYPES.imageGen:
    case CANVAS_NODE_TYPES.exportImage:
    case CANVAS_NODE_TYPES.storyboardGen:
    case CANVAS_NODE_TYPES.pano360Viewer: {
      const imageUrl = str("imageUrl") ?? str("previewImageUrl");
      return {
        mediaType: "image",
        sourceUrl: imageUrl,
        thumbUrl: imageUrl,
        label,
        directorControlBundle,
      };
    }
    default:
      return null;
  }
}
