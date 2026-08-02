// Copyright (c) 2026 AI anime

export interface RenderSettingsData {
  render_image_selection: string;
  sketch_aspect_padding: boolean;
}

export interface UpdateRenderSettingsCommand {
  renderImageSelection?: string;
  sketchAspectPadding?: boolean;
}

export interface SketchSettingsData {
  sketch_image_selection: string;
}

export interface UpdateSketchSettingsCommand {
  sketchImageSelection?: string;
}

export type SketchAspectRatio = "2:3" | "16:9";
