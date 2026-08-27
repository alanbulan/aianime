// Copyright (c) 2026 AI anime
import type { SketchAspectRatio } from "@/modules/production/domain/image-settings";

export interface GenerateSketchesCommand {
  gridIndex?: number;
  style?: string | null;
  sketchSceneGrouping?: boolean;
  aspectRatio?: SketchAspectRatio;
  imageGenerationSelection?: string;
  replaceExisting?: boolean;
}

export interface RenderGenerationSettings {
  imageGenerationSelection?: string;
  sketchAspectPadding?: boolean;
}

export interface RegenerateGridCommand extends RenderGenerationSettings {
  gridIndex: number;
  style?: string | null;
  sceneGrouping?: boolean;
  characterGrouping?: boolean;
}

export interface RegenerateSketchesCommand extends RenderGenerationSettings {
  beatIndices: number[];
  modeKey?: string;
}

export interface RegenerateRenderBeatsCommand
  extends RegenerateSketchesCommand,
    RenderGenerationSettings {}
