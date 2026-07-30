// Copyright (c) 2026 AI anime
import {
  isImageEditNode,
  resolveNodeSourceImageUrl,
  type CanvasNode,
} from "@/features/canvas/domain/canvasNodes";

export type ImageNodeToolbarProjection =
  | {
      visible: false;
      imageSource: null;
      canRotate: false;
    }
  | {
      visible: true;
      imageSource: string;
      canRotate: boolean;
    };

export function projectImageNodeToolbar(
  node: CanvasNode,
  isPresetLocked: boolean,
): ImageNodeToolbarProjection {
  const imageSource = resolveNodeSourceImageUrl(node);
  if (isImageEditNode(node) || !imageSource) {
    return { visible: false, imageSource: null, canRotate: false };
  }
  return {
    visible: true,
    imageSource,
    canRotate: !isPresetLocked,
  };
}
