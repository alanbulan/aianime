// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

import { freezoneVideoComposeGateway } from "./freezoneVideoComposeGateway";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
});

describe("freezoneVideoComposeGateway", () => {
  it("maps the complete Canvas compose request to the encoded endpoint", async () => {
    const task = {
      job_id: "job-1",
      task_key: "task-1",
      task_type: "freezone_video_compose",
    };
    const request = {
      canvasId: "canvas-1",
      resolution: "1080p" as const,
      tracks: [
        {
          trackId: "track-video-1",
          kind: "video" as const,
          items: [
            {
              itemId: "item-video-1",
              sourceUrl: "source.mp4",
              timelineStart: 0,
              sourceStart: 0.25,
              sourceEnd: 2.75,
            },
          ],
        },
      ],
    };
    vi.mocked(apiCall).mockResolvedValue(task);

    await expect(
      freezoneVideoComposeGateway.submit("project/1", request),
    ).resolves.toEqual(task);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/video/compose",
      {
        method: "POST",
        json: {
          title: "",
          canvas_id: "canvas-1",
          resolution: "1080p",
          fps: 30,
          background_color: "#000000",
          keep_original_audio: true,
          cover_url: "",
          tracks: [
            {
              track_id: "track-video-1",
              kind: "video",
              items: [
                {
                  item_id: "item-video-1",
                  source_url: "source.mp4",
                  timeline_start: 0,
                  source_start: 0.25,
                  source_end: 2.75,
                  volume: 1,
                  muted: false,
                  speed: 1,
                },
              ],
            },
          ],
        },
      },
    );
  });
});
