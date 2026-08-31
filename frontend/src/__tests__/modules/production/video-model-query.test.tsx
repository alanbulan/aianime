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

  it("projects H3 exact frame sizes into one semantic resolution tier", () => {
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
              resolutionOptions: ["1344x768", "768x1344", "1024x1024"],
              minDuration: 1,
              maxDuration: 15,
            },
            parameterSchema: {
              properties: {
                size: {
                  enum: ["1344x768", "768x1344", "1024x1024"],
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
        resolutionOptions: ["768p"],
        sizeOptions: ["1344x768", "768x1344", "1024x1024"],
        ratioOptions: ["16:9", "9:16", "1:1"],
      }),
    ]);
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
