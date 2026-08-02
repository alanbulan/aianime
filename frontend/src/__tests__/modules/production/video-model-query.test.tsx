// Copyright (c) 2026 AI anime
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createUseVideoModels } from "@/modules/production/application/video-model-query-hooks";
import { resolveAuthorizedVideoModel } from "@/modules/production/domain/video-model";

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
              code: "seedance-2.0-fast",
              displayName: "Seedance 2.0 Fast",
              operation: "VIDEO",
              capabilities: {
                videoProfile: "seedance2",
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
        value: "seedance-2.0-fast",
        label: "Seedance 2.0 Fast",
        profile: "seedance2",
        supportsNativeAudio: true,
        minDuration: 4,
        maxDuration: 15,
        resolutionOptions: ["480p", "720p"],
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
});
