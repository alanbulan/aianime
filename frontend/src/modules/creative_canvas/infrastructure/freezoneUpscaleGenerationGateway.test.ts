// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

import { freezoneUpscaleGenerationGateway } from "./freezoneUpscaleGenerationGateway";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
});

describe("freezoneUpscaleGenerationGateway", () => {
  it("maps the Canvas command to the encoded upscale endpoint", async () => {
    const task = {
      task_key: "upscale-task",
      task_type: "freezone_upscale",
      job_id: "upscale-job",
    };
    vi.mocked(apiCall).mockResolvedValue(task);
    const command = {
      sourceUrl: "/static/source.png",
      scaleFactor: 6 as const,
      imageSize: "4K" as const,
      model: "image-model",
    };

    await expect(
      freezoneUpscaleGenerationGateway.submit("project/1", command),
    ).resolves.toBe(task);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/upscale",
      {
        method: "POST",
        json: {
          source_url: "/static/source.png",
          scale_factor: 6,
          image_size: "4K",
          model: "image-model",
        },
      },
    );
  });
});
