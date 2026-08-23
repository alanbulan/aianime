// Copyright (c) 2026 AI anime
import type {
  Seedance2AssetItem,
  VideoInputCropTarget,
} from "@/modules/production/domain/seedance2-panel";
import {
  isSeedance15ProModel,
  normalizeVideoModelId,
  type Seedance2ConfigDraft,
} from "@/modules/production/domain/video-config";

export type Seedance2CropAspect = Seedance2ConfigDraft["ratio"];

export interface Seedance2CropIntent {
  asset: Seedance2AssetItem;
  target: VideoInputCropTarget;
}

export function isVideoReferenceCropModel(
  value: string | null | undefined,
): boolean {
  const model = normalizeVideoModelId(value);
  return (
    model === "seedance-1.0-pro-fast" ||
    model === "seedance-1.0-pro" ||
    isSeedance15ProModel(value)
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
  const [width, height] = aspect.split(":").map(Number);
  return width > 0 && height > 0 ? width / height : 9 / 16;
}
