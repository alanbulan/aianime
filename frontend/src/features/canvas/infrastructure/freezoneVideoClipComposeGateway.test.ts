// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const submitFreezoneVideoCompose = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({
  submitFreezoneVideoCompose,
}));

import { freezoneVideoClipComposeGateway } from "./freezoneVideoClipComposeGateway";

beforeEach(() => {
  submitFreezoneVideoCompose.mockReset();
});

describe("freezoneVideoClipComposeGateway", () => {
  it("maps the application submission to the compose API payload", async () => {
    const task = {
      job_id: "job-1",
      task_key: "task-1",
      task_type: "freezone_video_compose",
    };
    submitFreezoneVideoCompose.mockResolvedValue(task);

    await expect(
      freezoneVideoClipComposeGateway.submit("project-1", {
        resolution: "1080p",
        trackId: "track-video-1",
        itemId: "item-video-1",
        sourceUrl: "source.mp4",
        sourceStartSeconds: 0.25,
        sourceEndSeconds: 2.75,
      }),
    ).resolves.toEqual(task);
    expect(submitFreezoneVideoCompose).toHaveBeenCalledWith("project-1", {
      resolution: "1080p",
      tracks: [
        {
          trackId: "track-video-1",
          kind: "video",
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
    });
  });
});
