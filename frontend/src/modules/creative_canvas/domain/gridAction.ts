// Copyright (c) 2026 AI anime
export type GridActionKey =
  | "multiCameraGrid"
  | "plotFourGrid"
  | "faceThreeView"
  | "productThreeView"
  | "serialStoryboard25"
  | "cinematicLightCorrection"
  | "characterThreeView"
  | "frameProjection3sLater"
  | "frameProjection5sEarlier";

export type CanvasTemplateEditMode =
  | "multi_camera_nine_grid"
  | "story_pitch_four_grid"
  | "character_face_three_view"
  | "product_three_view"
  | "storyboard_25_grid"
  | "cinematic_light_correction"
  | "character_three_view_generation"
  | "image_projection_after_3s"
  | "image_projection_before_5s";

const GRID_ACTION_TEMPLATE_MODE: Record<
  GridActionKey,
  CanvasTemplateEditMode
> = {
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

export function isGridActionKey(value: unknown): value is GridActionKey {
  return (
    typeof value === "string"
    && Object.prototype.hasOwnProperty.call(GRID_ACTION_TEMPLATE_MODE, value)
  );
}

export interface GridActionRequest {
  readonly nodeId: string;
  readonly key: GridActionKey;
  readonly label: string;
  readonly prompt: string;
  readonly cost: number;
}

export function resolveGridActionTemplateMode(
  key: GridActionKey,
): CanvasTemplateEditMode {
  return GRID_ACTION_TEMPLATE_MODE[key];
}
