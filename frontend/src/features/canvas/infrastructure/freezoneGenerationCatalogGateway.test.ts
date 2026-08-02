// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";
import { loadCommercialModelCatalog } from "@/modules/model_usage/public";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));
vi.mock("@/modules/model_usage/public", () => ({
  loadCommercialModelCatalog: vi.fn(),
}));

import {
  commercialImageModels,
  commercialVideoModels,
  freezoneGenerationCatalogGateway,
} from "./freezoneGenerationCatalogGateway";

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
  vi.mocked(loadCommercialModelCatalog).mockReset();
});

describe("freezoneGenerationCatalogGateway", () => {
  it("maps Commercial Gateway SKU codes without exposing upstream providers", () => {
    const catalog = {
      catalogVersion: "catalog-v1",
      items: [
        {
          id: "sku-1",
          code: "cloud-generation-standard",
          displayName: "Cloud Generation Standard",
          operation: "IMAGE",
          capabilities: {
            resolutions: ["720p", "1080p"],
            minSeconds: 4,
            maxSeconds: 15,
            supportedModes: ["TEXT_TO_VIDEO", "VIDEO_EDIT"],
            supportsHumanReview: true,
            supportsReferenceVideos: true,
            referenceLimits: {
              images: 5,
              videos: 1,
              audios: 0,
              total: 6,
              audioDurationSeconds: 15.2,
            },
            sceneOptimizeOptions: ["ANIME", "realistic"],
            defaultSceneOptimize: "realistic",
          },
          parameterSchema: {},
        },
      ],
    };

    expect(commercialImageModels(catalog)).toEqual([
      {
        id: "cloud-generation-standard",
        apiModel: "cloud-generation-standard",
        label: "Cloud Generation Standard",
        capabilities: {
          resolutions: ["720p", "1080p"],
          minSeconds: 4,
          maxSeconds: 15,
          supportedModes: ["TEXT_TO_VIDEO", "VIDEO_EDIT"],
          supportsHumanReview: true,
          supportsReferenceVideos: true,
          referenceLimits: {
            images: 5,
            videos: 1,
            audios: 0,
            total: 6,
            audioDurationSeconds: 15.2,
          },
          sceneOptimizeOptions: ["ANIME", "realistic"],
          defaultSceneOptimize: "realistic",
        },
        parameterSchema: {},
      },
    ]);
    expect(commercialVideoModels(catalog)).toEqual([
      {
        id: "cloud-generation-standard",
        apiModel: "cloud-generation-standard",
        label: "Cloud Generation Standard",
        supportedModes: ["textToVideo", "videoEdit"],
        supportsHumanReview: true,
        supportsReferenceVideos: true,
        maxReferenceImages: 5,
        maxReferenceVideos: 1,
        maxReferenceAudios: 0,
        maxReferenceTotal: 6,
        maxReferenceAudioDurationSeconds: 15.2,
        resolutionOptions: ["720p", "1080p"],
        minDuration: 4,
        maxDuration: 15,
        sceneOptimizeOptions: ["anime", "realistic"],
        defaultSceneOptimize: "realistic",
      },
    ]);
  });

  it("projects explicit image generation and edit capabilities", () => {
    const catalog = {
      catalogVersion: "image-roles-v1",
      items: [
        {
          id: "generation-only",
          code: "cloud/image-generation",
          displayName: "Generation",
          operation: "IMAGE",
          capabilities: { supportedModes: ["TEXT_TO_IMAGE"] },
          parameterSchema: {},
        },
        {
          id: "edit-only",
          code: "cloud/image-edit",
          displayName: "Edit",
          operation: "IMAGE",
          capabilities: { supportedModes: ["IMAGE_EDIT"] },
          parameterSchema: {},
        },
      ],
    };

    expect(
      commercialImageModels(catalog).map(({ apiModel, imageModes }) => ({
        apiModel,
        imageModes,
      })),
    ).toEqual([
      { apiModel: "cloud/image-generation", imageModes: ["generation"] },
      { apiModel: "cloud/image-edit", imageModes: ["edit"] },
    ]);
  });

  it("uses the authenticated commercial catalog as the only model source", async () => {
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: { commercial: {} },
    });
    vi.mocked(loadCommercialModelCatalog)
      .mockResolvedValueOnce({
        catalogVersion: "image-v1",
        items: [{
          id: "image-sku",
          code: "image-standard",
          displayName: "Image Standard",
          operation: "IMAGE",
          capabilities: {},
          parameterSchema: {},
        }],
      })
      .mockResolvedValueOnce({
        catalogVersion: "video-v1",
        items: [{
          id: "video-sku",
          code: "video-standard",
          displayName: "Video Standard",
          operation: "VIDEO",
          capabilities: { resolutions: ["720p", "1080p"] },
          parameterSchema: {},
        }],
      });

    await expect(
      freezoneGenerationCatalogGateway.listImageModels("project/1"),
    ).resolves.toEqual([
      {
        id: "image-standard",
        apiModel: "image-standard",
        label: "Image Standard",
        capabilities: {},
        parameterSchema: {},
      },
    ]);
    await expect(
      freezoneGenerationCatalogGateway.listVideoModels("project/1"),
    ).resolves.toEqual([
      {
        id: "video-standard",
        apiModel: "video-standard",
        label: "Video Standard",
        resolutionOptions: ["720p", "1080p"],
        minDuration: null,
        maxDuration: null,
      },
    ]);
    expect(loadCommercialModelCatalog).toHaveBeenNthCalledWith(1, "IMAGE");
    expect(loadCommercialModelCatalog).toHaveBeenNthCalledWith(2, "VIDEO");
    expect(apiCall).not.toHaveBeenCalled();
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
