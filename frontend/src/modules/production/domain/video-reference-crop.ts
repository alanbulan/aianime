// Copyright (c) 2026 AI anime
import type {
  VideoReferenceAssetItem,
  VideoInputCropTarget,
} from "@/modules/production/domain/video-reference-panel";
import type { BeatVideoConfigDraft } from "@/modules/production/domain/video-config";

export type VideoReferenceCropAspect = BeatVideoConfigDraft["ratio"];

export interface VideoReferenceCropIntent {
  asset: VideoReferenceAssetItem;
  target: VideoInputCropTarget;
}

export function videoReferenceCropAspectForMode(
  mode: BeatVideoConfigDraft["mode"],
  ratio: BeatVideoConfigDraft["ratio"],
  firstFrameAspect: "2:3" | "16:9",
): VideoReferenceCropAspect {
  if (mode === "first_frame" || mode === "first_last_frame") {
    return videoInputCropAspectForProjectAspect(firstFrameAspect);
  }
  return ratio === "16:9" ? "16:9" : "9:16";
}

export function videoReferenceCropTargetForAsset(
  mode: BeatVideoConfigDraft["mode"],
  asset: VideoReferenceAssetItem,
): VideoInputCropTarget {
  if (mode === "first_frame") return "first_frame";
  if (mode === "first_last_frame") {
    return asset.key === "last_frame" ? "last_frame" : "first_frame";
  }
  if (mode === "multimodal_reference") {
    if (asset.key === "first_frame") return "first_frame";
    if (asset.key === "last_frame") return "last_frame";
  }
  return "reference_image";
}

export function videoInputCropAspectForProjectAspect(
  aspect: "2:3" | "16:9",
): VideoReferenceCropAspect {
  return aspect === "16:9" ? "16:9" : "9:16";
}

export function cropAspectRatioValue(aspect: VideoReferenceCropAspect): number {
  const [width, height] = aspect.split(":").map(Number);
  return width > 0 && height > 0 ? width / height : 9 / 16;
}
