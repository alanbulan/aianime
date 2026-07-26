// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const submitFreezoneVideoCompose = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({
  submitFreezoneVideoCompose,
}));

import { freezoneVideoComposeGateway } from "./freezoneVideoComposeGateway";

beforeEach(() => {
  submitFreezoneVideoCompose.mockReset();
});

describe("freezoneVideoComposeGateway", () => {
  it("forwards the complete Canvas compose request", async () => {
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
    submitFreezoneVideoCompose.mockResolvedValue(task);

    await expect(
      freezoneVideoComposeGateway.submit("project-1", request),
    ).resolves.toEqual(task);
    expect(submitFreezoneVideoCompose).toHaveBeenCalledWith(
      "project-1",
      request,
    );
  });
});
