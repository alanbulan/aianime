// Copyright (c) 2026 AI anime
import type { AssetLibraryDropMediaType } from "./assetLibraryModel";

export type CanvasCommitMediaType = AssetLibraryDropMediaType;

export interface CanvasCommitSourceNode {
  id?: string;
  type?: string;
  position?: { x: number; y: number };
  data?: unknown;
}

export interface CanvasCommitSourceInfo {
  mediaType: CanvasCommitMediaType;
  sourceUrl: string | null;
  thumbUrl: string | null;
  label: string;
  directorControlBundle: Record<string, unknown> | null;
}

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

export function deriveNodeDropInfo(
  node: CanvasCommitSourceNode,
): CanvasCommitSourceInfo | null {
  const data =
    node.data && typeof node.data === "object"
      ? (node.data as Record<string, unknown>)
      : {};
  const str = (key: string): string | null => stringValue(data[key]);
  const label = str("displayName") ?? str("sourceFileName") ?? "节点";
  const directorControlBundle =
    data.director_control_bundle &&
    typeof data.director_control_bundle === "object"
      ? (data.director_control_bundle as Record<string, unknown>)
      : null;

  if (node.type === "videoNode") {
    return {
      mediaType: "video",
      sourceUrl: str("videoUrl"),
      thumbUrl: str("previewImageUrl"),
      label,
      directorControlBundle,
    };
  }
  if (node.type === "audioNode") {
    return {
      mediaType: "audio",
      sourceUrl: str("audioUrl"),
      thumbUrl: null,
      label,
      directorControlBundle,
    };
  }
  if (node.type === "threeDWorldNode") {
    return {
      mediaType: "model",
      sourceUrl: modelSourceUrlFromNodeData(data),
      thumbUrl: str("previewImageUrl") ?? str("coverUrl"),
      label,
      directorControlBundle,
    };
  }
  if (
    node.type === "uploadNode" ||
    node.type === "imageNode" ||
    node.type === "imageGenNode" ||
    node.type === "exportImageNode" ||
    node.type === "storyboardGenNode" ||
    node.type === "pano360ViewerNode"
  ) {
    const imageUrl = str("imageUrl") ?? str("previewImageUrl");
    return {
      mediaType: "image",
      sourceUrl: imageUrl,
      thumbUrl: imageUrl,
      label,
      directorControlBundle,
    };
  }
  return null;
}
