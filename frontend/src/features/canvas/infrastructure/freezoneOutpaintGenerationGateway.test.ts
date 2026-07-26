// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

const submitFreezoneOutpaint = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({ submitFreezoneOutpaint }));

import { freezoneOutpaintGenerationGateway } from "./freezoneOutpaintGenerationGateway";

describe("freezoneOutpaintGenerationGateway", () => {
  it("maps the Canvas command to the Freezone client", async () => {
    const task = {
      task_key: "outpaint-task",
      task_type: "freezone_outpaint",
      job_id: "outpaint-job",
    };
    submitFreezoneOutpaint.mockResolvedValue(task);
    const command = {
      sourceUrl: "/static/source.png",
      targetAspectRatio: "9:16" as const,
      numImages: 1 as const,
      imageSize: "2K" as const,
      model: "image-model",
    };

    await expect(
      freezoneOutpaintGenerationGateway.submit("project-1", command),
    ).resolves.toBe(task);
    expect(submitFreezoneOutpaint).toHaveBeenCalledWith("project-1", command);
  });
});
