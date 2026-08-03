// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  buildImageMatteFailurePatch,
  buildImageMatteInitialData,
  buildImageMatteSuccessPatch,
  resolveImageMatteUploadFilename,
} from "./imageMatteNodeModel";

describe("imageMatteNodeModel", () => {
  it("builds the loading child with source aspect and mainline inheritance", () => {
    const mainlineContext = [{ project_id: "project-a" }];
    const data = buildImageMatteInitialData(
      {
        imageUrl: "/source.png",
        aspectRatio: "4:3",
        preset_managed: true,
        projection_key: "projection-a",
        mainline_context: mainlineContext,
        committed_slot_url: "/canonical.png",
      },
      "抠图",
      1234,
    );

    expect(data).toMatchObject({
      displayName: "抠图",
      imageUrl: null,
      previewImageUrl: null,
      aspectRatio: "4:3",
      resultKind: "matte",
      isGenerating: true,
      generationStartedAt: 1234,
      user_spawned: true,
      source_projection_key: "projection-a",
      mainline_context: mainlineContext,
      committed_slot_url: "/canonical.png",
    });
    expect(data).not.toHaveProperty("preset_managed");
    expect(data).not.toHaveProperty("projection_key");
  });

  it("falls back the source aspect and projects terminal patches", () => {
    expect(
      buildImageMatteInitialData(
        { imageUrl: "/source.png" },
        "抠图",
        1,
      ),
    ).toMatchObject({ aspectRatio: "1:1" });
    expect(buildImageMatteSuccessPatch("/matte.png")).toEqual({
      imageUrl: "/matte.png",
      previewImageUrl: "/matte.png",
      isGenerating: false,
      generationStartedAt: null,
      generationError: null,
      generationErrorDetails: null,
    });
    expect(buildImageMatteFailurePatch("failed")).toEqual({
      isGenerating: false,
      generationStartedAt: null,
      generationError: "failed",
      generationErrorDetails: "failed",
    });
    expect(resolveImageMatteUploadFilename("image-a", 1234)).toBe(
      "matte-image-a-1234.png",
    );
  });
});
