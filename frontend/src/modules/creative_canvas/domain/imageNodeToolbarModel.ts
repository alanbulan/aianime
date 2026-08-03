// Copyright (c) 2026 AI anime

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
  imageSource: string | null,
  isImageEdit: boolean,
  isPresetLocked: boolean,
): ImageNodeToolbarProjection {
  if (isImageEdit || !imageSource) {
    return { visible: false, imageSource: null, canRotate: false };
  }
  return {
    visible: true,
    imageSource,
    canRotate: !isPresetLocked,
  };
}
