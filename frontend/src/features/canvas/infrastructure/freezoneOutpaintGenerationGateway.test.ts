// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

import { freezoneOutpaintGenerationGateway } from "./freezoneOutpaintGenerationGateway";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
});

describe("freezoneOutpaintGenerationGateway", () => {
  it("maps the Canvas command to the encoded outpaint endpoint", async () => {
    const task = {
      task_key: "outpaint-task",
      task_type: "freezone_outpaint",
      job_id: "outpaint-job",
    };
    vi.mocked(apiCall).mockResolvedValue(task);
    const command = {
      sourceUrl: "/static/source.png",
      targetAspectRatio: "9:16" as const,
      numImages: 1 as const,
      imageSize: "2K" as const,
      model: "image-model",
    };

    await expect(
      freezoneOutpaintGenerationGateway.submit("project/1", command),
    ).resolves.toBe(task);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/outpaint",
      {
        method: "POST",
        json: {
          source_url: "/static/source.png",
          target_aspect_ratio: "9:16",
          num_images: 1,
          image_size: "2K",
          model: "image-model",
        },
      },
    );
  });
});
