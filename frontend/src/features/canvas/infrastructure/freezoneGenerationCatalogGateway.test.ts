// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchFreezoneCameraOptions = vi.hoisted(() => vi.fn());
const fetchFreezoneImageModels = vi.hoisted(() => vi.fn());
const fetchFreezoneVideoCameraTemplates = vi.hoisted(() => vi.fn());
const fetchFreezoneVideoModels = vi.hoisted(() => vi.fn());
const listFreezoneStyleTemplates = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({
  fetchFreezoneCameraOptions,
  fetchFreezoneImageModels,
  fetchFreezoneVideoCameraTemplates,
  fetchFreezoneVideoModels,
  listFreezoneStyleTemplates,
}));

import { freezoneGenerationCatalogGateway } from "./freezoneGenerationCatalogGateway";

beforeEach(() => {
  fetchFreezoneCameraOptions.mockReset();
  fetchFreezoneImageModels.mockReset();
  fetchFreezoneVideoCameraTemplates.mockReset();
  fetchFreezoneVideoModels.mockReset();
  listFreezoneStyleTemplates.mockReset();
});

describe("freezoneGenerationCatalogGateway", () => {
  it("maps image and video model transport records", async () => {
    fetchFreezoneImageModels.mockResolvedValue([
      {
        id: "openai/gpt-image-2",
        providerId: "openai",
        apiModel: "gpt-image-2",
        label: "GPT Image 2",
      },
    ]);
    fetchFreezoneVideoModels.mockResolvedValue([
      {
        id: "seedance-2",
        providerId: "seedance",
        apiModel: "seedance-2",
        label: "Seedance 2",
        resolutionOptions: ["720p", "1080p"],
        minDuration: 4,
        maxDuration: 15,
        sceneOptimizeOptions: ["anime", "realistic"],
        defaultSceneOptimize: "anime",
      },
    ]);

    await expect(
      freezoneGenerationCatalogGateway.listImageModels("project-1"),
    ).resolves.toEqual([
      {
        id: "openai/gpt-image-2",
        providerId: "openai",
        apiModel: "gpt-image-2",
        label: "GPT Image 2",
      },
    ]);
    await expect(
      freezoneGenerationCatalogGateway.listVideoModels("project-1"),
    ).resolves.toEqual([
      {
        id: "seedance-2",
        providerId: "seedance",
        apiModel: "seedance-2",
        label: "Seedance 2",
        resolutionOptions: ["720p", "1080p"],
        minDuration: 4,
        maxDuration: 15,
        sceneOptimizeOptions: ["anime", "realistic"],
        defaultSceneOptimize: "anime",
      },
    ]);
    expect(fetchFreezoneImageModels).toHaveBeenCalledWith("project-1");
    expect(fetchFreezoneVideoModels).toHaveBeenCalledWith("project-1");
  });

  it("maps camera and style transport fields to application DTOs", async () => {
    fetchFreezoneCameraOptions.mockResolvedValue({
      camera_bodies: [{ id: "arri", label: "ARRI" }],
      lenses: [{ id: "cooke", label: "Cooke" }],
      focal_lengths_mm: [35],
      apertures: ["f/2.8"],
    });
    listFreezoneStyleTemplates.mockResolvedValue([
      {
        id: "anime",
        label: "Anime",
        style_prompt: "anime style",
        category: "illustration",
      },
    ]);

    await expect(
      freezoneGenerationCatalogGateway.getCameraOptions("project-2"),
    ).resolves.toEqual({
      cameraBodies: [{ id: "arri", label: "ARRI" }],
      lenses: [{ id: "cooke", label: "Cooke" }],
      focalLengthsMm: [35],
      apertures: ["f/2.8"],
    });
    await expect(
      freezoneGenerationCatalogGateway.listStyleTemplates("project-2"),
    ).resolves.toEqual([
      {
        id: "anime",
        label: "Anime",
        stylePrompt: "anime style",
        category: "illustration",
      },
    ]);
  });

  it("preserves domain camera movement presets", async () => {
    const presets = [
      {
        id: "dolly-in",
        label: "Dolly In",
        promptFragment: "camera pushes in",
        videoUrl: null,
      },
    ];
    fetchFreezoneVideoCameraTemplates.mockResolvedValue(presets);

    await expect(
      freezoneGenerationCatalogGateway.listVideoCameraTemplates("project-3"),
    ).resolves.toBe(presets);
    expect(fetchFreezoneVideoCameraTemplates).toHaveBeenCalledWith("project-3");
  });
});
