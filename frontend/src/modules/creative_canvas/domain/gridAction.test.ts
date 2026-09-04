// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  resolveGridActionAspectRatio,
  resolveGridActionTemplateMode,
  type GridActionKey,
} from "./gridAction";

describe("grid-action domain", () => {
  it("maps every toolbar action to its template-edit mode", () => {
    const expected: Record<GridActionKey, string> = {
      multiCameraGrid: "multi_camera_nine_grid",
      plotFourGrid: "story_pitch_four_grid",
      faceThreeView: "character_face_three_view",
      productThreeView: "product_three_view",
      serialStoryboard25: "storyboard_25_grid",
      cinematicLightCorrection: "cinematic_light_correction",
      characterThreeView: "character_three_view_generation",
      frameProjection3sLater: "image_projection_after_3s",
      frameProjection5sEarlier: "image_projection_before_5s",
    };

    for (const [key, mode] of Object.entries(expected)) {
      expect(resolveGridActionTemplateMode(key as GridActionKey)).toBe(mode);
    }
  });

  it("matches the backend output aspect ratio contract", () => {
    expect(resolveGridActionAspectRatio("multi_camera_nine_grid")).toBe(
      "original",
    );
    expect(resolveGridActionAspectRatio("character_face_three_view")).toBe(
      "3:2",
    );
    expect(resolveGridActionAspectRatio("product_three_view")).toBe("3:2");
    expect(resolveGridActionAspectRatio("character_three_view_generation")).toBe(
      "16:9",
    );
  });
});
