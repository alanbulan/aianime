// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

const submitFreezoneUpscale = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({ submitFreezoneUpscale }));

import { freezoneUpscaleGenerationGateway } from "./freezoneUpscaleGenerationGateway";

describe("freezoneUpscaleGenerationGateway", () => {
  it("maps the Canvas command to the Freezone client", async () => {
    const task = {
      task_key: "upscale-task",
      task_type: "freezone_upscale",
      job_id: "upscale-job",
    };
    submitFreezoneUpscale.mockResolvedValue(task);
    const command = {
      sourceUrl: "/static/source.png",
      scaleFactor: 6 as const,
      imageSize: "4K" as const,
      model: "image-model",
    };

    await expect(
      freezoneUpscaleGenerationGateway.submit("project-1", command),
    ).resolves.toBe(task);
    expect(submitFreezoneUpscale).toHaveBeenCalledWith("project-1", command);
  });
});
