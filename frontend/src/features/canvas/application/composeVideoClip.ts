// Copyright (c) 2026 AI anime
import type { VideoGenQuality } from "../domain/canvasNodes";
import {
  composeCanvasVideo,
  type ComposeCanvasVideoDependencies,
} from "./composeCanvasVideo";

export interface ComposeVideoClipParams {
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
  readonly url: string | null;
  readonly durationMs: number;
}

export async function composeVideoClip(
  params: ComposeVideoClipParams,
  dependencies: ComposeVideoClipDependencies,
): Promise<ComposeVideoClipResult> {
  const { url } = await composeCanvasVideo(
    {
      projectId: params.projectId,
      request: {
        resolution: params.quality === "1080P" ? "1080p" : "720p",
        tracks: [
          {
            trackId: `track_${params.nodeId}_video`,
            kind: "video",
            items: [
              {
                itemId: `item_${params.nodeId}_${dependencies.now()}`,
                sourceUrl: params.sourceUrl,
                timelineStart: 0,
                sourceStart: params.startMs / 1000,
                sourceEnd: params.endMs / 1000,
              },
            ],
          },
        ],
      },
    },
    dependencies,
  );
  return {
    url: url || null,
    durationMs: Math.round(params.endMs - params.startMs),
  };
}
