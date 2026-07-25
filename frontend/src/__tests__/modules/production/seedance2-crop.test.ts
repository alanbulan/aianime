// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  isSeedanceReferenceCropBackend,
  seedance2CropAspectForMode,
  seedance2CropTargetForAsset,
  videoInputCropAspectForProjectAspect,
} from "@/modules/production/domain/seedance2-crop";
import type { Seedance2AssetItem } from "@/modules/production/domain/seedance2-panel";

const asset = (key: string): Seedance2AssetItem => ({
  key,
  label: key,
  media_type: "image",
  selected: true,
  exists: true,
  reference_label: "图片1",
  note: "",
});

describe("Production Seedance2 crop rules", () => {
  it("maps project frames to supported video input aspects", () => {
    expect(videoInputCropAspectForProjectAspect("2:3")).toBe("9:16");
    expect(videoInputCropAspectForProjectAspect("16:9")).toBe("16:9");
    expect(seedance2CropAspectForMode("first_frame", "16:9", "2:3")).toBe(
      "9:16",
    );
    expect(
      seedance2CropAspectForMode("multimodal_reference", "16:9", "2:3"),
    ).toBe("16:9");
  });

  it("selects the crop target from mode and asset role", () => {
    expect(seedance2CropTargetForAsset("first_frame", asset("first_frame"))).toBe(
      "first_frame",
    );
    expect(
      seedance2CropTargetForAsset("first_last_frame", asset("last_frame")),
    ).toBe("last_frame");
    expect(
      seedance2CropTargetForAsset(
        "multimodal_reference",
        asset("manual:image:1"),
      ),
    ).toBe("reference_image");
  });

  it("recognizes Seedance reference crop backends", () => {
    expect(isSeedanceReferenceCropBackend("newapi_seedance-1.0-pro-fast")).toBe(
      true,
    );
    expect(isSeedanceReferenceCropBackend("seedance-1.5-pro")).toBe(true);
    expect(isSeedanceReferenceCropBackend("grok-video")).toBe(false);
  });
});
