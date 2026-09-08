// Copyright (c) 2026 AI anime
import type { VideoGenQuality } from "../domain/videoGenerationModel";
import {
  composeCanvasVideo,
  type ComposeCanvasVideoDependencies,
} from "./composeCanvasVideo";

export interface VideoClipOptions {
  readonly muted?: boolean;
  readonly repeatCount?: 1 | 2;
}

export interface ComposeVideoClipParams extends VideoClipOptions {
  readonly projectId: string;
  readonly nodeId: string;
  readonly sourceUrl: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly quality: VideoGenQuality;
}

export interface ComposeVideoClipDependencies
  extends ComposeCanvasVideoDependencies {
  readonly now: () => number;
}

export interface ComposeVideoClipResult {
  readonly url: string;
  readonly durationMs: number;
}

export async function composeVideoClip(
  params: ComposeVideoClipParams,
  dependencies: ComposeVideoClipDependencies,
): Promise<ComposeVideoClipResult> {
  const repeatCount = params.repeatCount ?? 1;
  const selectionMs = params.endMs - params.startMs;
  const itemId = `item_${params.nodeId}_${dependencies.now()}`;
  const { url } = await composeCanvasVideo(
    {
      projectId: params.projectId,
      request: {
        resolution: params.quality === "1080P" ? "1080p" : "720p",
        tracks: [
          {
            trackId: `track_${params.nodeId}_video`,
            kind: "video",
            items: Array.from({ length: repeatCount }, (_, index) => ({
              itemId: index === 0 ? itemId : `${itemId}_${index}`,
              sourceUrl: params.sourceUrl,
              timelineStart: index * selectionMs / 1000,
              sourceStart: params.startMs / 1000,
              sourceEnd: params.endMs / 1000,
              muted: params.muted ?? false,
            })),
          },
        ],
      },
    },
    dependencies,
  );
  return {
    url,
    durationMs: Math.round(selectionMs * repeatCount),
  };
}
