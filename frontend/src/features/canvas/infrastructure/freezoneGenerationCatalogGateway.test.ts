// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

import { freezoneGenerationCatalogGateway } from "./freezoneGenerationCatalogGateway";

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
});

describe("freezoneGenerationCatalogGateway", () => {
  it("normalizes image and video model transport records", async () => {
    vi.mocked(apiCall)
      .mockResolvedValueOnce({
        openai: [
          {
            id: "openai/gpt-image-2",
            model: "gpt-image-2",
            display_name: "GPT Image 2",
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "seedance-2",
            provider: "seedance",
            model: "seedance-2",
            display_name: "Seedance 2",
            resolution_options: ["720P", "1080p", "4k"],
            min_duration: "4",
            maxDuration: 15,
            scene_optimize_options: ["ANIME", "realistic", "invalid"],
            default_scene_optimize: "ANIME",
          },
        ],
      });

    await expect(
      freezoneGenerationCatalogGateway.listImageModels("project/1"),
    ).resolves.toEqual([
      {
        id: "openai/gpt-image-2",
        providerId: "openai",
        apiModel: "gpt-image-2",
        label: "GPT Image 2",
      },
    ]);
    await expect(
      freezoneGenerationCatalogGateway.listVideoModels("project/1"),
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
    expect(apiCall).toHaveBeenNthCalledWith(
      1,
      "projects/project%2F1/freezone/image/models",
    );
    expect(apiCall).toHaveBeenNthCalledWith(
      2,
      "projects/project%2F1/freezone/video/models",
    );
  });

  it("maps camera and style transport fields to application DTOs", async () => {
    vi.mocked(apiCall)
      .mockResolvedValueOnce({
        camera_bodies: [{ id: "arri", label: "ARRI" }],
        lenses: [{ id: "cooke", label: "Cooke" }],
        focal_lengths_mm: [35],
        apertures: ["f/2.8"],
      })
      .mockResolvedValueOnce([
        {
          id: "anime",
          label: "Anime",
          style_prompt: "anime style",
          category: "illustration",
        },
      ]);

    await expect(
      freezoneGenerationCatalogGateway.getCameraOptions("project/2"),
    ).resolves.toEqual({
      cameraBodies: [{ id: "arri", label: "ARRI" }],
      lenses: [{ id: "cooke", label: "Cooke" }],
      focalLengthsMm: [35],
      apertures: ["f/2.8"],
    });
    await expect(
      freezoneGenerationCatalogGateway.listStyleTemplates("project/2"),
    ).resolves.toEqual([
      {
        id: "anime",
        label: "Anime",
        stylePrompt: "anime style",
        category: "illustration",
      },
    ]);
    expect(apiCall).toHaveBeenNthCalledWith(
      1,
      "projects/project%2F2/freezone/image/camera-options",
    );
    expect(apiCall).toHaveBeenNthCalledWith(
      2,
      "projects/project%2F2/freezone/image/style-templates",
    );
  });

  it("normalizes camera movement templates to the domain contract", async () => {
    vi.mocked(apiCall).mockResolvedValue({
      camera_templates: [
        {
          template_id: "dolly-in",
          display_name: "Dolly In",
          prompt_fragment: "camera pushes in",
          preview_url: "/camera/dolly-in.mp4",
        },
      ],
    });

    await expect(
      freezoneGenerationCatalogGateway.listVideoCameraTemplates("project/3"),
    ).resolves.toEqual([
      {
        id: "dolly-in",
        label: "Dolly In",
        promptFragment: "camera pushes in",
        videoUrl: "/camera/dolly-in.mp4",
      },
    ]);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F3/freezone/video/camera-templates",
    );
  });
});
