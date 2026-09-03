// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { CanvasVideoComposeGateway } from "../application/composeCanvasVideo";
import type { CanvasGenerationTaskRef } from "../application/completeCanvasMediaGenerationTask";

export const freezoneVideoComposeGateway: CanvasVideoComposeGateway = {
  async submit(projectId, request) {
    return await apiCall<CanvasGenerationTaskRef>(
      `projects/${encodeURIComponent(projectId)}/freezone/video/compose`,
      {
        method: "POST",
        json: {
          title: request.title ?? "",
          canvas_id: request.canvasId ?? "",
          resolution: request.resolution ?? "1080p",
          fps: request.fps ?? 30,
          background_color: request.backgroundColor ?? "#000000",
          keep_original_audio: request.keepOriginalAudio ?? true,
          tracks: request.tracks.map((track) => ({
            track_id: track.trackId,
            kind: track.kind,
            items: track.items.map((item) => ({
              item_id: item.itemId,
              source_url: item.sourceUrl,
              timeline_start: item.timelineStart ?? 0,
              source_start: item.sourceStart ?? 0,
              source_end: item.sourceEnd,
              volume: item.volume ?? 1,
              muted: item.muted ?? false,
              speed: item.speed ?? 1,
            })),
          })),
        },
      },
    );
  },
};
