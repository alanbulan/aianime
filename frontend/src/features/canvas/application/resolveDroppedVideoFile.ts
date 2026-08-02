// Copyright (c) 2026 AI anime
import { isVideoFile } from "@/modules/creative_canvas/public";

export interface DroppedVideoFileItem {
  readonly kind: string;
  getAsFile(): File | null;
}

export interface DroppedVideoDataTransfer {
  readonly files?: ArrayLike<File> | null;
  readonly items?: ArrayLike<DroppedVideoFileItem> | null;
}

export function resolveDroppedVideoFile(
  dataTransfer: DroppedVideoDataTransfer,
): File | null {
  const directFile = dataTransfer.files?.[0];
  if (directFile && isVideoFile(directFile)) {
    return directFile;
  }

  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file && isVideoFile(file)) return file;
  }

  return null;
}
