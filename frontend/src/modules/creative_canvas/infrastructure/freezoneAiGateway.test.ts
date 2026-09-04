// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";
const submitImageGeneration = vi.hoisted(() => vi.fn());
const prepareCanvasImageSource = vi.hoisted(() => vi.fn());
const prepareCanvasImageSources = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));
import { createFreezoneAiGateway } from "./freezoneAiGateway";

function gateway() {
  return createFreezoneAiGateway({
    composeCapability: vi.fn(),
    getCanvasMetadata: () => null,
    resolveShotMetadataPrompt: (prompt) => ({
      cleanedPrompt: prompt,
      suffix: "",
    }),
    resolvePromptReferenceRoles: (prompt, references) => ({
      cleanedPrompt: prompt,
      references,
      suffix: "",
    }),
    submitImageGeneration,
    prepareImageSource: prepareCanvasImageSource,
    prepareImageSources: prepareCanvasImageSources,
  });
}

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
  vi.mocked(prepareCanvasImageSource).mockReset();
  vi.mocked(prepareCanvasImageSources).mockReset();
  submitImageGeneration.mockReset();
});

describe("freezoneAiGateway", () => {
  it("returns the complete task receipt without starting a second in-memory waiter", async () => {
    const task = {
      task_type: "freezone_gen",
      task_key: "gen-task",
      job_id: "gen-job",
    };
    submitImageGeneration.mockResolvedValue(task);

    await expect(
      gateway().submitGenerateImageJob(
        { projectId: "project/1", canvasId: "canvas-1" },
        {
          prompt: "Portrait",
          model: "cloud-image-standard",
          size: "2K",
          aspectRatio: "1:1",
        },
      ),
    ).resolves.toEqual(task);
  });

  it("delegates reference-free generation through the injected application port", async () => {
    submitImageGeneration.mockResolvedValue({
      task_type: "freezone_gen",
      task_key: "gen-task",
      job_id: "gen-job",
    });
    const task = {
      task_type: "freezone_gen",
      task_key: "gen-task",
      job_id: "gen-job",
    } as const;

    await expect(
      gateway().submitGenerateImageJob(
        { projectId: "project/1", canvasId: "canvas-1" },
        {
          prompt: "Portrait",
          model: "cloud-image-standard",
          size: "2K",
          aspectRatio: "1:1",
          nodeId: "node-1",
        },
      ),
    ).resolves.toEqual(task);

    expect(submitImageGeneration).toHaveBeenCalledWith("project/1", {
      prompt: "Portrait",
      aspectRatio: "1:1",
      imageSize: "2K",
      referenceUrls: [],
      model: "cloud-image-standard",
      modelId: undefined,
      genMode: undefined,
      quality: undefined,
      canvasId: "canvas-1",
      nodeId: "node-1",
    });
  });

  it("submits reference-image editing through its owned endpoint", async () => {
    vi.mocked(prepareCanvasImageSource).mockResolvedValue("/static/base.png");
    vi.mocked(prepareCanvasImageSources).mockResolvedValue([
      "/static/extra.png",
    ]);
    vi.mocked(apiCall).mockResolvedValue({
      task_type: "freezone_edit",
      task_key: "edit-task",
      job_id: "edit-job",
    });
    const task = {
      task_type: "freezone_edit",
      task_key: "edit-task",
      job_id: "edit-job",
    } as const;

    await expect(
      gateway().submitGenerateImageJob(
        { projectId: "project/1", canvasId: "canvas-1" },
        {
          prompt: "Edit prompt",
          model: "cloud-image-standard",
          modelId: "registry-model",
          generationMode: "image_reference",
          size: "4K",
          aspectRatio: "16:9",
          referenceImages: ["base-data", "extra-data"],
          extraParams: { quality: "high" },
          nodeId: "node-1",
        },
      ),
    ).resolves.toEqual(task);

    expect(prepareCanvasImageSource).toHaveBeenCalledWith(
      "project/1",
      "base-data",
    );
    expect(prepareCanvasImageSources).toHaveBeenCalledWith("project/1", [
      "extra-data",
    ]);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/edit",
      {
        method: "POST",
        json: {
          prompt: "Edit prompt",
          base_url: "/static/base.png",
          extra_reference_urls: ["/static/extra.png"],
          aspect_ratio: "16:9",
          image_size: "4K",
          model: "cloud-image-standard",
          model_id: "registry-model",
          gen_mode: "image_reference",
          quality: "high",
          extra_params: { quality: "high" },
          canvas_id: "canvas-1",
          node_id: "node-1",
        },
      },
    );
  });

  it("preserves source geometry when a reference edit omits both selectors", async () => {
    vi.mocked(prepareCanvasImageSource).mockResolvedValue("/static/base.png");
    vi.mocked(prepareCanvasImageSources).mockResolvedValue([]);
    vi.mocked(apiCall).mockResolvedValue({
      task_type: "freezone_edit",
      task_key: "edit-task",
      job_id: "edit-job",
    });

    await gateway().submitGenerateImageJob(
      { projectId: "project-1", canvasId: "canvas-1" },
      {
        prompt: "Retouch only",
        model: "cloud-image-standard",
        size: "",
        aspectRatio: "",
        referenceImages: ["base-data"],
      },
    );

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project-1/freezone/edit",
      expect.objectContaining({
        json: expect.objectContaining({
          aspect_ratio: "original",
          image_size: "original",
        }),
      }),
    );
  });
});
