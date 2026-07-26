// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

const submitFreezoneMultiView = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({ submitFreezoneMultiView }));

import { freezoneMultiAngleGenerationGateway } from "./freezoneMultiAngleGenerationGateway";

describe("freezoneMultiAngleGenerationGateway", () => {
  it("maps the Canvas command to the Freezone client", async () => {
    const task = {
      task_key: "multi-angle-task",
      task_type: "freezone_multi_view",
      job_id: "multi-angle-job",
    };
    submitFreezoneMultiView.mockResolvedValue(task);
    const command = {
      sourceUrl: "/static/source.png",
      preset: "front_up" as const,
      yawDegrees: 30,
      pitchDegrees: -20,
      shotSize: "wide" as const,
      prompt: "low angle",
      model: "image-model",
      imageSize: "4K" as const,
    };

    await expect(
      freezoneMultiAngleGenerationGateway.submit("project-1", command),
    ).resolves.toBe(task);
    expect(submitFreezoneMultiView).toHaveBeenCalledWith("project-1", command);
  });
});
