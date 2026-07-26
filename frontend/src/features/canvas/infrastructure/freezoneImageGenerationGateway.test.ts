// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

const submitFreezoneGen = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({ submitFreezoneGen }));

import { freezoneImageGenerationGateway } from "./freezoneImageGenerationGateway";

describe("freezoneImageGenerationGateway", () => {
  it("maps the Canvas image command to the Freezone client", async () => {
    const task = {
      job_id: "job-1",
      task_key: "task-1",
      task_type: "freezone_gen",
    };
    submitFreezoneGen.mockResolvedValue(task);
    const command = {
      prompt: "character portrait",
      aspectRatio: "16:9",
      imageSize: "2K",
      referenceUrls: ["/static/reference.png"],
      model: "gpt-image-2",
      canvasId: "canvas-1",
      nodeId: "image-1",
    };

    await expect(
      freezoneImageGenerationGateway.submit("project-1", command),
    ).resolves.toEqual(task);
    expect(submitFreezoneGen).toHaveBeenCalledWith("project-1", {
      prompt: "character portrait",
      aspectRatio: "16:9",
      imageSize: "2K",
      referenceUrls: ["/static/reference.png"],
      camera: undefined,
      style: undefined,
      provider: undefined,
      model: "gpt-image-2",
      modelId: undefined,
      genMode: undefined,
      quality: undefined,
      canvasId: "canvas-1",
      nodeId: "image-1",
    });
  });

  it("rejects an unexpected task type at the adapter boundary", async () => {
    submitFreezoneGen.mockResolvedValue({
      job_id: "job-1",
      task_key: "task-1",
      task_type: "freezone_edit",
    });

    await expect(
      freezoneImageGenerationGateway.submit("project-1", {
        prompt: "character portrait",
      }),
    ).rejects.toThrow("Unexpected image generation task type: freezone_edit");
  });
});
