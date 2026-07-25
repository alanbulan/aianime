// Copyright (c) 2026 AI anime
import type { CropBox } from "@/lib/aspect-ratio";
import type {
  Seedance2AssetItem,
  VideoInputCropTarget,
} from "@/modules/production/domain/seedance2-panel";
import {
  isSeedance15ProBackend,
  seedance2ModelFromBackend,
  type Seedance2ConfigDraft,
} from "@/modules/production/domain/video-config";

export type Seedance2CropAspect = "2:3" | "9:16" | "16:9";

export interface Seedance2CropIntent {
  asset: Seedance2AssetItem;
  target: VideoInputCropTarget;
}

export function isSeedanceReferenceCropBackend(
  value: string | null | undefined,
): boolean {
  const model = seedance2ModelFromBackend(value);
  return (
    model === "seedance-1.0-pro-fast" ||
    model === "seedance-1.0-pro" ||
    model === "seedance_1.0_pro_fast" ||
    isSeedance15ProBackend(value)
  );
}

export function seedance2CropAspectForMode(
  mode: Seedance2ConfigDraft["mode"],
  ratio: Seedance2ConfigDraft["ratio"],
  firstFrameAspect: "2:3" | "16:9",
): Seedance2CropAspect {
  if (mode === "first_frame" || mode === "first_last_frame") {
    return videoInputCropAspectForProjectAspect(firstFrameAspect);
  }
  return ratio === "16:9" ? "16:9" : "9:16";
}

export function seedance2CropTargetForAsset(
  mode: Seedance2ConfigDraft["mode"],
  asset: Seedance2AssetItem,
): VideoInputCropTarget {
  if (mode === "first_frame") return "first_frame";
  if (mode === "first_last_frame") {
    return asset.key === "last_frame" ? "last_frame" : "first_frame";
  }
  return "reference_image";
}

export function videoInputCropAspectForProjectAspect(
  aspect: "2:3" | "16:9",
): Seedance2CropAspect {
  return aspect === "16:9" ? "16:9" : "9:16";
}

export function cropAspectRatioValue(aspect: Seedance2CropAspect): number {
  if (aspect === "16:9") return 16 / 9;
  if (aspect === "2:3") return 2 / 3;
  return 9 / 16;
}

export function clampSeedance2CropBox(
  crop: CropBox,
  sourceWidth: number,
  sourceHeight: number,
): CropBox {
  const width = Math.max(1, Math.min(Math.round(crop.width), sourceWidth));
  const height = Math.max(1, Math.min(Math.round(crop.height), sourceHeight));

  return {
    x: Math.min(
      Math.max(0, Math.round(crop.x)),
      Math.max(0, sourceWidth - width),
    ),
    y: Math.min(
      Math.max(0, Math.round(crop.y)),
      Math.max(0, sourceHeight - height),
    ),
    width,
    height,
  };
}
