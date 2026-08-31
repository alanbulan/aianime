// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  videoReferenceCropAspectForMode,
  videoReferenceCropTargetForAsset,
  videoInputCropAspectForProjectAspect,
} from "@/modules/production/domain/video-reference-crop";
import type { VideoReferenceAssetItem } from "@/modules/production/domain/video-reference-panel";

const asset = (key: string): VideoReferenceAssetItem => ({
  key,
  label: key,
  media_type: "image",
  selected: true,
  exists: true,
  reference_label: "图片1",
  note: "",
});

describe("Production VideoReference crop rules", () => {
  it("maps project frames to supported video input aspects", () => {
    expect(videoInputCropAspectForProjectAspect("2:3")).toBe("9:16");
    expect(videoInputCropAspectForProjectAspect("16:9")).toBe("16:9");
    expect(videoReferenceCropAspectForMode("first_frame", "16:9", "2:3")).toBe(
      "9:16",
    );
    expect(
      videoReferenceCropAspectForMode("multimodal_reference", "16:9", "2:3"),
    ).toBe("16:9");
  });

  it("selects the crop target from mode and asset role", () => {
    expect(videoReferenceCropTargetForAsset("first_frame", asset("first_frame"))).toBe(
      "first_frame",
    );
    expect(
      videoReferenceCropTargetForAsset("first_last_frame", asset("last_frame")),
    ).toBe("last_frame");
    expect(
      videoReferenceCropTargetForAsset(
        "multimodal_reference",
        asset("manual:image:1"),
      ),
    ).toBe("reference_image");
    expect(
      videoReferenceCropTargetForAsset(
        "multimodal_reference",
        asset("first_frame"),
      ),
    ).toBe("first_frame");
    expect(
      videoReferenceCropTargetForAsset(
        "multimodal_reference",
        asset("last_frame"),
      ),
    ).toBe("last_frame");
  });
});
