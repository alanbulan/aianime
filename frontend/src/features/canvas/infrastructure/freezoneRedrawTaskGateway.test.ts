// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

const submitFreezoneRedraw = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({ submitFreezoneRedraw }));
vi.mock("./freezoneGenerationTaskGateway", () => ({
  freezoneGenerationTaskGateway: {
    awaitCompletion: vi.fn(),
    fetchResultUrl: vi.fn(),
  },
}));

import { freezoneRedrawTaskGateway } from "./freezoneRedrawTaskGateway";

describe("freezoneRedrawTaskGateway", () => {
  it("maps the complete redraw command to the Freezone client", async () => {
    const task = {
      task_key: "redraw-task",
      task_type: "freezone_redraw",
      job_id: "redraw-job",
    };
    submitFreezoneRedraw.mockResolvedValue(task);

    await expect(
      freezoneRedrawTaskGateway.submit("project-1", {
        sourceUrl: "/static/source.png",
        maskUrl: "/static/mask.png",
        prompt: "replace the sky",
        aspectRatio: "16:9",
        imageSize: "4K",
        model: "image-model",
      }),
    ).resolves.toBe(task);
    expect(submitFreezoneRedraw).toHaveBeenCalledWith("project-1", {
      sourceUrl: "/static/source.png",
      maskUrl: "/static/mask.png",
      prompt: "replace the sky",
      aspectRatio: "16:9",
      numImages: 1,
      imageSize: "4K",
      model: "image-model",
    });
  });
});
