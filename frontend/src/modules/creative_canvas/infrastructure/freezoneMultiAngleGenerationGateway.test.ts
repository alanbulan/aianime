// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

import { freezoneMultiAngleGenerationGateway } from "./freezoneMultiAngleGenerationGateway";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
});

describe("freezoneMultiAngleGenerationGateway", () => {
  it("maps the Canvas command to the encoded multi-view endpoint", async () => {
    const task = {
      task_key: "multi-angle-task",
      task_type: "freezone_multi_view",
      job_id: "multi-angle-job",
    };
    vi.mocked(apiCall).mockResolvedValue(task);
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
      freezoneMultiAngleGenerationGateway.submit("project/1", command),
    ).resolves.toBe(task);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/multi-view",
      {
        method: "POST",
        json: {
          source_url: "/static/source.png",
          preset: "front_up",
          yaw_degrees: 30,
          pitch_degrees: -20,
          shot_size: "wide",
          prompt: "low angle",
          image_size: "4K",
          model: "image-model",
        },
      },
    );
  });
});
