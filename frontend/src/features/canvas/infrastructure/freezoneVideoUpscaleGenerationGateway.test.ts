// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

const submitFreezoneVideoUpscale = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({ submitFreezoneVideoUpscale }));

import { freezoneVideoUpscaleGenerationGateway } from "./freezoneVideoUpscaleGenerationGateway";

describe("freezoneVideoUpscaleGenerationGateway", () => {
  it("maps the Canvas command to the Freezone client", async () => {
    const task = {
      task_key: "video-upscale-task",
      task_type: "freezone_video_upscale",
      job_id: "video-upscale-job",
    };
    submitFreezoneVideoUpscale.mockResolvedValue(task);
    const command = {
      sourceUrl: "/static/source.mp4",
      resolution: "2k" as const,
      frameInterpolation: "none" as const,
      denoiseStrength: "1x" as const,
      canvasId: "canvas-1",
      nodeId: "video-1",
    };

    await expect(
      freezoneVideoUpscaleGenerationGateway.submit("project-1", command),
    ).resolves.toBe(task);
    expect(submitFreezoneVideoUpscale).toHaveBeenCalledWith(
      "project-1",
      command,
    );
  });
});
