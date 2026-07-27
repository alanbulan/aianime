// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";
import { ensureBackendImageUrls } from "./freezoneAssetGateway";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));
vi.mock("./freezoneAssetGateway", () => ({ ensureBackendImageUrls: vi.fn() }));

import { freezoneImageGenerationGateway } from "./freezoneImageGenerationGateway";

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
  vi.mocked(ensureBackendImageUrls).mockReset();
  vi.mocked(ensureBackendImageUrls).mockResolvedValue([]);
});

describe("freezoneImageGenerationGateway", () => {
  it("normalizes references and maps the Canvas command to the encoded endpoint", async () => {
    const task = {
      job_id: "job-1",
      task_key: "task-1",
      task_type: "freezone_gen",
    };
    vi.mocked(ensureBackendImageUrls).mockResolvedValue([
      "/static/reference.png",
    ]);
    vi.mocked(apiCall).mockResolvedValue(task);
    const command = {
      prompt: "character portrait",
      aspectRatio: "16:9",
      imageSize: "2K",
      referenceUrls: ["data:image/png;base64,eA=="],
      camera: {
        cameraBodyId: "sony-a7",
        lensId: "prime-50",
        focalLengthMm: 50,
        aperture: "f/1.8",
      },
      style: { templateId: "cinematic" },
      provider: "openai" as const,
      model: "gpt-image-2",
      modelId: "image-model",
      genMode: "image_reference",
      quality: "high",
      canvasId: "canvas-1",
      nodeId: "image-1",
    };

    await expect(
      freezoneImageGenerationGateway.submit("project/1", command),
    ).resolves.toEqual(task);
    expect(ensureBackendImageUrls).toHaveBeenCalledWith("project/1", [
      "data:image/png;base64,eA==",
    ]);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/gen",
      {
        method: "POST",
        json: {
          prompt: "character portrait",
          aspect_ratio: "16:9",
          image_size: "2K",
          reference_urls: ["/static/reference.png"],
          camera: {
            camera_body: "sony-a7",
            lens: "prime-50",
            focal_length_mm: 50,
            aperture: "f/1.8",
          },
          style: { template_id: "cinematic" },
          provider: "openai",
          model: "gpt-image-2",
          model_id: "image-model",
          gen_mode: "image_reference",
          quality: "high",
          canvas_id: "canvas-1",
          node_id: "image-1",
        },
      },
    );
  });

  it("rejects an unexpected task type at the adapter boundary", async () => {
    vi.mocked(apiCall).mockResolvedValue({
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
