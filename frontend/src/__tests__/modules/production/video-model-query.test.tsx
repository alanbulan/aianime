// Copyright (c) 2026 AI anime
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createUseVideoModels } from "@/modules/production/application/video-model-query-hooks";
import {
  resolveAuthorizedVideoModel,
  resolveVideoModelOption,
} from "@/modules/production/domain/video-model";

describe("Production video model query", () => {
  it("maps the entitlement-filtered commercial VIDEO catalog", () => {
    let requestedOperation = "";
    const useVideoModels = createUseVideoModels((operation) => {
      requestedOperation = operation ?? "";
      return {
        data: {
          catalogVersion: "catalog-v1",
          items: [
            {
              id: "video-1",
              code: "video-model-reference",
              displayName: "Video Model Reference",
              operation: "VIDEO",
              capabilities: {
                routeSelector: "cloud:video-model-reference",
                videoWorkflow: "advanced-reference",
                generateAudio: true,
              },
              parameterSchema: {
                properties: {
                  resolution: { enum: ["480p", "720p"] },
                  duration: { minimum: 4, maximum: 15 },
                },
              },
            },
          ],
        },
        error: null,
        isLoading: false,
      };
    });

    const { result } = renderHook(() => useVideoModels());

    expect(requestedOperation).toBe("VIDEO");
    expect(result.current.data).toEqual([
      expect.objectContaining({
        value: "cloud:video-model-reference",
        label: "Video Model Reference",
        workflow: "advanced-reference",
        supportsNativeAudio: true,
        minDuration: 4,
        maxDuration: 15,
        resolutionOptions: ["480p", "720p"],
      }),
    ]);
  });

  it("uses the workflow and route declared by the catalog", () => {
    const useVideoModels = createUseVideoModels(() => ({
      data: {
        catalogVersion: "catalog-v1",
        items: [
          {
            id: "cloud-video-model",
            code: "video-model-multimodal",
            displayName: "Multimodal video model",
            operation: "VIDEO",
            capabilities: {
              routeSelector: "cloud:video-model-multimodal",
              videoWorkflow: "advanced-reference",
              advancedConfig: true,
              modes: [
                "TEXT_TO_VIDEO",
                "IMAGE_TO_VIDEO",
                "MULTIMODAL_REFERENCE",
              ],
              ratioOptions: ["16:9", "9:16", "1:1"],
              resolutionOptions: ["480p", "720p", "1080p"],
              minDuration: 4,
              maxDuration: 15,
              referenceImageMax: 9,
              referenceVideoMax: 3,
            },
            parameterSchema: {},
          },
        ],
      },
      error: null,
      isLoading: false,
    }));

    const { result } = renderHook(() => useVideoModels());

    expect(result.current.data).toEqual([
      expect.objectContaining({
        value: "cloud:video-model-multimodal",
        apiModel: "video-model-multimodal",
        label: "Multimodal video model",
        workflow: "advanced-reference",
        supportsAdvancedConfig: true,
        minDuration: 4,
        maxDuration: 15,
        resolutionOptions: ["480p", "720p", "1080p"],
        ratioOptions: ["16:9", "9:16", "1:1"],
      }),
    ]);
  });

  it("opens model configuration from complete video capabilities when the schema is empty", () => {
    const useVideoModels = createUseVideoModels(() => ({
      data: {
        catalogVersion: "catalog-capability-only",
        items: [
          {
            id: "intermediary-video",
            code: "intermediary-video",
            displayName: "Intermediary video model",
            operation: "VIDEO",
            capabilities: {
              routeSelector: "cloud:intermediary-video",
              supportedModes: [
                "TEXT_TO_VIDEO",
                "IMAGE_TO_VIDEO",
                "MULTIMODAL_REFERENCE",
              ],
              resolutionOptions: ["480p", "720p", "1080p"],
              ratioOptions: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"],
              minDuration: 4,
              maxDuration: 15,
              referenceImageMax: 9,
              referenceVideoMax: 3,
              referenceAudioMax: 0,
            },
            parameterSchema: {},
          },
        ],
      },
      error: null,
      isLoading: false,
    }));

    const { result } = renderHook(() => useVideoModels());

    expect(result.current.data).toEqual([
      expect.objectContaining({
        value: "cloud:intermediary-video",
        workflow: "standard",
        supportsAdvancedConfig: true,
        minDuration: 4,
        maxDuration: 15,
        resolutionOptions: ["480p", "720p", "1080p"],
        ratioOptions: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"],
        supportedModes: [
          "TEXT_TO_VIDEO",
          "IMAGE_TO_VIDEO",
          "MULTIMODAL_REFERENCE",
        ],
        referenceImageMax: 9,
        referenceVideoMax: 3,
        referenceAudioMax: 0,
      }),
    ]);
  });

  it("keeps an explicit advanced-config disable ahead of capability inference", () => {
    const useVideoModels = createUseVideoModels(() => ({
      data: {
        catalogVersion: "catalog-explicit-disable",
        items: [
          {
            id: "restricted-video",
            code: "restricted-video",
            displayName: "Restricted video model",
            operation: "VIDEO",
            capabilities: {
              routeSelector: "cloud:restricted-video",
              advancedConfig: false,
              supportedModes: ["TEXT_TO_VIDEO", "IMAGE_TO_VIDEO"],
              resolutionOptions: ["720p", "1080p"],
              ratioOptions: ["16:9", "9:16"],
              minDuration: 4,
              maxDuration: 15,
            },
            parameterSchema: {},
          },
        ],
      },
      error: null,
      isLoading: false,
    }));

    const { result } = renderHook(() => useVideoModels());

    expect(result.current.data?.[0]?.supportsAdvancedConfig).toBe(false);
  });

  it("keeps H3 exact sizes and audio capabilities aligned with the catalog", () => {
    const useVideoModels = createUseVideoModels(() => ({
      data: {
        catalogVersion: "catalog-h3",
        items: [
          {
            id: "h3",
            code: "video-model-basic",
            displayName: "Exact-size video model",
            operation: "VIDEO",
            capabilities: {
              routeSelector: "cloud:video-model-basic",
              supportedModes: ["IMAGE_TO_VIDEO", "MULTIMODAL_REFERENCE"],
              ratioOptions: ["16:9", "9:16", "1:1"],
              resolutionOptions: ["1024x576", "576x1024", "1024x1024"],
              minDuration: 1,
              maxDuration: 15,
              nativeAudio: true,
              generateAudio: false,
            },
            parameterSchema: {
              properties: {
                size: {
                  enum: ["1024x576", "576x1024", "1024x1024"],
                },
              },
            },
          },
        ],
      },
      error: null,
      isLoading: false,
    }));

    const { result } = renderHook(() => useVideoModels());

    expect(result.current.data).toEqual([
      expect.objectContaining({
        value: "cloud:video-model-basic",
        apiModel: "video-model-basic",
        workflow: "standard",
        supportsAdvancedConfig: true,
        supportsNativeAudio: true,
        sizeOptions: ["1024x576", "576x1024", "1024x1024"],
        ratioOptions: ["16:9", "9:16", "1:1"],
      }),
    ]);
    expect(result.current.data[0]).not.toHaveProperty("resolutionOptions");
  });

  it("does not let a stale persisted model bypass the current catalog", () => {
    const options = [{ value: "video-a" }, { value: "video-b" }];

    expect(resolveAuthorizedVideoModel(options, "video-b")).toBe("video-b");
    expect(resolveAuthorizedVideoModel(options, "removed-video")).toBe(
      "video-a",
    );
    expect(resolveAuthorizedVideoModel([], "removed-video")).toBe("");
  });

  it("accepts only explicit routed catalog selections", () => {
    const options = [
      {
        value: "cloud:model-42",
        apiModel: "provider-video-model",
        label: "provider-video-model",
      },
      {
        value: "byok:provider-a:video-model-reference",
        apiModel: "video-model-reference",
        label: "Video Model Reference · provider-a",
      },
    ];

    expect(resolveVideoModelOption(options, "provider-video-model")).toBeUndefined();
    expect(resolveVideoModelOption(options, "cloud:model-42")).toBe(options[0]);
    expect(resolveAuthorizedVideoModel(options, "cloud:model-42")).toBe(
      "cloud:model-42",
    );
  });
});
