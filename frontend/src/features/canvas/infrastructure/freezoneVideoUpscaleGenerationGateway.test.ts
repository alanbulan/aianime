// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

import { freezoneVideoUpscaleGenerationGateway } from "./freezoneVideoUpscaleGenerationGateway";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
});

describe("freezoneVideoUpscaleGenerationGateway", () => {
  it("maps the Canvas command to the encoded upscale endpoint", async () => {
    const task = {
      task_key: "video-upscale-task",
      task_type: "freezone_video_upscale",
      job_id: "video-upscale-job",
    };
    vi.mocked(apiCall).mockResolvedValue(task);
    const command = {
      sourceUrl: "/static/source.mp4",
      resolution: "2k" as const,
      frameInterpolation: "none" as const,
      denoiseStrength: "1x" as const,
      canvasId: "canvas-1",
      nodeId: "video-1",
    };

    await expect(
      freezoneVideoUpscaleGenerationGateway.submit("project/1", command),
    ).resolves.toBe(task);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/video/upscale",
      {
        method: "POST",
        json: {
          source_url: "/static/source.mp4",
          resolution: "2k",
          frame_interpolation: "none",
          denoise_strength: "1x",
          canvas_id: "canvas-1",
          node_id: "video-1",
        },
      },
    );
  });
});
