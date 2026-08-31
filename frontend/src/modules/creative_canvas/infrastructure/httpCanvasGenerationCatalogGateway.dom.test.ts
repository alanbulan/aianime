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
  httpCanvasGenerationCatalogGateway,
} from "./httpCanvasGenerationCatalogGateway";

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
  vi.mocked(loadCommercialModelCatalog).mockReset();
});

describe("httpCanvasGenerationCatalogGateway", () => {
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
            supportedModes: ["TEXT_TO_VIDEO", "FIRST_FRAME", "VIDEO_EDIT"],
            supportsHumanReview: true,
            supportsReferenceVideos: true,
            referenceImageMax: 5,
            referenceVideoMax: 1,
            referenceAudioMax: 0,
            referenceAudioMinSeconds: 1.8,
            referenceAudioMaxSeconds: 15.2,
            referenceAudioTotalMinSeconds: 2,
            referenceAudioTotalMaxSeconds: 15.2,
            referenceVideoMinSeconds: 2,
            referenceVideoMaxSeconds: 10,
            referenceVideoTotalMinSeconds: 4,
            referenceVideoTotalMaxSeconds: 20,
            referenceLimits: {
              total: 6,
            },
            sceneOptimizeOptions: ["cinematic", "realistic"],
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
          supportedModes: ["TEXT_TO_VIDEO", "FIRST_FRAME", "VIDEO_EDIT"],
          supportsHumanReview: true,
          supportsReferenceVideos: true,
          referenceImageMax: 5,
          referenceVideoMax: 1,
          referenceAudioMax: 0,
          referenceAudioMinSeconds: 1.8,
          referenceAudioMaxSeconds: 15.2,
          referenceAudioTotalMinSeconds: 2,
          referenceAudioTotalMaxSeconds: 15.2,
          referenceVideoMinSeconds: 2,
          referenceVideoMaxSeconds: 10,
          referenceVideoTotalMinSeconds: 4,
          referenceVideoTotalMaxSeconds: 20,
          referenceLimits: {
            total: 6,
          },
          sceneOptimizeOptions: ["cinematic", "realistic"],
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
        capabilities: catalog.items[0].capabilities,
        supportedModes: ["textToVideo", "firstFrame", "videoEdit"],
        supportsHumanReview: true,
        supportsReferenceVideos: true,
        maxReferenceImages: 5,
        maxReferenceVideos: 1,
        maxReferenceAudios: 0,
        maxReferenceTotal: 6,
        referenceAudioMinSeconds: 1.8,
        referenceAudioMaxSeconds: 15.2,
        referenceAudioTotalMinSeconds: 2,
        referenceAudioTotalMaxSeconds: 15.2,
        referenceVideoMinSeconds: 2,
        referenceVideoMaxSeconds: 10,
        referenceVideoTotalMinSeconds: 4,
        referenceVideoTotalMaxSeconds: 20,
        resolutionOptions: ["720p", "1080p"],
        minDuration: 4,
        maxDuration: 15,
        defaultDuration: null,
        sceneOptimizeOptions: ["cinematic", "realistic"],
        defaultSceneOptimize: "realistic",
        parameterSchema: {},
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
      httpCanvasGenerationCatalogGateway.listImageModels("project/1"),
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
      httpCanvasGenerationCatalogGateway.listVideoModels("project/1"),
    ).resolves.toEqual([
      {
        id: "video-standard",
        apiModel: "video-standard",
        label: "Video Standard",
        capabilities: { resolutions: ["720p", "1080p"] },
        resolutionOptions: ["720p", "1080p"],
        minDuration: null,
        maxDuration: null,
        defaultDuration: null,
        parameterSchema: {},
      },
    ]);
    expect(loadCommercialModelCatalog).toHaveBeenNthCalledWith(1, "IMAGE");
    expect(loadCommercialModelCatalog).toHaveBeenNthCalledWith(2, "VIDEO");
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("keeps H3 exact sizes and schema parameters separate from resolution tiers", () => {
    const capabilities = {
      supportedModes: ["TEXT_TO_VIDEO", "IMAGE_TO_VIDEO", "MULTIMODAL_REFERENCE"],
      resolutionOptions: ["1344x768", "768x1344", "1024x1024"],
      ratioOptions: ["16:9", "9:16", "1:1"],
      minDuration: 1,
      maxDuration: 15,
      generateAudio: false,
    };
    const parameterSchema = {
      type: "object",
      properties: {
        seconds: { type: "integer", minimum: 1, maximum: 15, default: 3 },
        size: {
          type: "string",
          enum: ["1344x768", "768x1344", "1024x1024"],
          default: "1344x768",
        },
        steps: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        seed: { type: "integer", minimum: 0, maximum: 2147483647, default: 42 },
        turbo: { type: "boolean", default: false },
      },
    };

    expect(commercialVideoModels({
      catalogVersion: "h3-v1",
      items: [{
        id: "h3",
        code: "video-model-basic",
        displayName: "MiniMax H3",
        operation: "VIDEO",
        capabilities,
        parameterSchema,
      }],
    })).toEqual([
      expect.objectContaining({
        apiModel: "video-model-basic",
        supportedModes: ["textToVideo", "imageToVideo", "allReference"],
        sizeOptions: ["1344x768", "768x1344", "1024x1024"],
        aspectRatioOptions: ["16:9", "9:16", "1:1"],
        minDuration: 1,
        maxDuration: 15,
        defaultDuration: 3,
        supportsGenerateAudio: false,
        parameterSchema,
      }),
    ]);
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
      httpCanvasGenerationCatalogGateway.getCameraOptions("project/2"),
    ).resolves.toEqual({
      cameraBodies: [{ id: "arri", label: "ARRI" }],
      lenses: [{ id: "cooke", label: "Cooke" }],
      focalLengthsMm: [35],
      apertures: ["f/2.8"],
    });
    await expect(
      httpCanvasGenerationCatalogGateway.listStyleTemplates("project/2"),
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
      httpCanvasGenerationCatalogGateway.listVideoCameraTemplates("project/3"),
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
