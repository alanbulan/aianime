// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

import { freezoneRedrawGenerationGateway } from "./freezoneRedrawGenerationGateway";

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
});

describe("freezoneRedrawGenerationGateway", () => {
  it("maps the complete redraw command to the encoded endpoint", async () => {
    const task = {
      task_key: "redraw-task",
      task_type: "freezone_redraw",
      job_id: "redraw-job",
    };
    vi.mocked(apiCall).mockResolvedValue(task);

    await expect(
      freezoneRedrawGenerationGateway.submit("project/1", {
        sourceUrl: "/static/source.png",
        maskUrl: "/static/mask.png",
        prompt: "replace the sky",
        aspectRatio: "16:9",
        imageSize: "4K",
        model: "image-model",
      }),
    ).resolves.toBe(task);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/redraw",
      {
        method: "POST",
        json: {
          source_url: "/static/source.png",
          mask_url: "/static/mask.png",
          prompt: "replace the sky",
          aspect_ratio: "16:9",
          num_images: 1,
          image_size: "4K",
          model: "image-model",
        },
      },
    );
  });
});
