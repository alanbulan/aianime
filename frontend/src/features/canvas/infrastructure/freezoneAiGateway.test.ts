// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";
import {
  ensureBackendImageUrl,
  ensureBackendImageUrls,
} from "./freezoneAssetGateway";

const awaitCompletion = vi.hoisted(() => vi.fn());
const fetchResultUrl = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));
vi.mock("@/lib/url-params", () => ({
  readUrl: () => ({ project: "project/1", canvas: "canvas-1" }),
}));
vi.mock("@/features/freezone/public", () => ({
  composeCapability: vi.fn(),
  getFreezoneCanvasMetadata: vi.fn(),
  resolveCurrentShotMetadataPrompt: (prompt: string) => ({
    cleanedPrompt: prompt,
    suffix: "",
  }),
  resolvePromptReferenceRoles: (prompt: string, references: string[]) => ({
    cleanedPrompt: prompt,
    references,
    suffix: "",
  }),
}));
vi.mock("./freezoneAssetGateway", () => ({
  ensureBackendImageUrl: vi.fn(),
  ensureBackendImageUrls: vi.fn(),
}));
vi.mock("./freezoneGenerationTaskGateway", () => ({
  freezoneGenerationTaskGateway: { awaitCompletion, fetchResultUrl },
}));
vi.mock("./freezoneImageGenerationGateway", () => ({
  freezoneImageGenerationGateway: { submit: vi.fn() },
}));

import { freezoneAiGateway } from "./freezoneAiGateway";

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
  vi.mocked(ensureBackendImageUrl).mockReset();
  vi.mocked(ensureBackendImageUrls).mockReset();
  awaitCompletion.mockReset();
  fetchResultUrl.mockReset();
});

describe("freezoneAiGateway", () => {
  it("submits reference-image editing through its owned endpoint", async () => {
    vi.mocked(ensureBackendImageUrl).mockResolvedValue("/static/base.png");
    vi.mocked(ensureBackendImageUrls).mockResolvedValue([
      "/static/extra.png",
    ]);
    vi.mocked(apiCall).mockResolvedValue({
      task_type: "freezone_edit",
      task_key: "edit-task",
      job_id: "edit-job",
    });
    awaitCompletion.mockResolvedValue({
      result: { output_url: "/static/result.png" },
    });

    await expect(
      freezoneAiGateway.generateImage({
        prompt: "Edit prompt",
        model: "openai/gpt-image-2",
        modelId: "registry-model",
        generationMode: "image_reference",
        size: "4K",
        aspectRatio: "16:9",
        referenceImages: ["base-data", "extra-data"],
        extraParams: { quality: "high" },
        nodeId: "node-1",
      }),
    ).resolves.toBe("/static/result.png");

    expect(ensureBackendImageUrl).toHaveBeenCalledWith(
      "project/1",
      "base-data",
    );
    expect(ensureBackendImageUrls).toHaveBeenCalledWith("project/1", [
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
          provider: "openai",
          model: "gpt-image-2",
          model_id: "registry-model",
          gen_mode: "image_reference",
          quality: "high",
          canvas_id: "canvas-1",
          node_id: "node-1",
        },
      },
    );
    expect(awaitCompletion).toHaveBeenCalledWith("edit-task", "project/1");
    expect(fetchResultUrl).not.toHaveBeenCalled();
  });
});
