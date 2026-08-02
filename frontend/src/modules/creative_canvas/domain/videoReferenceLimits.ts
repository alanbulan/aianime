// Copyright (c) 2026 AI anime
import type { VideoGenMode } from "./videoGenerationMode";

export type VideoReferenceItem =
  | {
      kind: "image";
      nodeId: string;
      imageUrl: string;
      displayName?: string | null;
    }
  | {
      kind: "video";
      nodeId: string;
      videoUrl: string;
      thumbUrl?: string | null;
      displayName?: string | null;
    }
  | {
      kind: "audio";
      nodeId: string;
      audioUrl: string;
      displayName?: string | null;
    };

export type VideoReferenceCaps = Readonly<
  Record<VideoReferenceItem["kind"], number>
>;

export interface VideoReferenceCapEntry {
  readonly item: VideoReferenceItem;
  readonly typeIndex: number;
  readonly withinCap: boolean;
}

const REFERENCE_CAPS_BY_MODE: Partial<
  Record<VideoGenMode, VideoReferenceCaps>
> = {
  allReference: { image: 9, video: 3, audio: 3 },
  firstLastFrame: { image: 2, video: 0, audio: 0 },
};

export function videoReferenceCapsForMode(
  mode: VideoGenMode,
): VideoReferenceCaps | null {
  return REFERENCE_CAPS_BY_MODE[mode] ?? null;
}

export function classifyVideoReferenceItems(
  items: ReadonlyArray<VideoReferenceItem>,
  mode: VideoGenMode,
): VideoReferenceCapEntry[] {
  const counts: Record<VideoReferenceItem["kind"], number> = {
    image: 0,
    video: 0,
    audio: 0,
  };
  const caps = videoReferenceCapsForMode(mode);

  return items.map((item) => {
    counts[item.kind] += 1;
    const cap = caps?.[item.kind];
    return {
      item,
      typeIndex: counts[item.kind],
      withinCap: cap == null || counts[item.kind] <= cap,
    };
  });
}
