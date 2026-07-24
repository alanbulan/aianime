// Copyright (c) 2026 AI anime
import type { SketchAspectRatio } from "@/modules/production/domain/image-settings";

export interface GenerateSketchesCommand {
  gridIndex?: number;
  style?: string | null;
  model?: string;
  sketchSceneGrouping?: boolean;
  aspectRatio?: SketchAspectRatio;
  imageGenerationSelection?: string;
}

export interface RenderGenerationSettings {
  imageGenerationSelection?: string;
  sketchAspectPadding?: boolean;
}

export interface RegenerateGridCommand extends RenderGenerationSettings {
  gridIndex: number;
  style?: string | null;
  model?: string;
  sceneGrouping?: boolean;
  characterGrouping?: boolean;
}

export interface RegenerateSketchesCommand {
  beatIndices: number[];
  modeKey?: string;
}

export interface RegenerateRenderBeatsCommand
  extends RegenerateSketchesCommand,
    RenderGenerationSettings {}
