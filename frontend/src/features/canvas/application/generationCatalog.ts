// Copyright (c) 2026 AI anime
import type { CameraMovementPreset } from "../domain/cameraMovementPresets";

export type CanvasImageModelProvider = "huimeng" | "openrouter" | "openai";

export interface CanvasImageModel {
  readonly id: string;
  readonly providerId: CanvasImageModelProvider;
  readonly apiModel: string;
  readonly label: string;
}

export type CanvasVideoModelProvider = "seedance" | "huimeng";

export interface CanvasVideoModel {
  readonly id: string;
  readonly providerId: CanvasVideoModelProvider;
  readonly apiModel: string;
  readonly label: string;
  readonly resolutionOptions?: string[];
  readonly minDuration?: number | null;
  readonly maxDuration?: number | null;
  readonly sceneOptimizeOptions?: Array<"anime" | "realistic">;
  readonly defaultSceneOptimize?: "anime" | "realistic" | null;
}

export interface CanvasStyleTemplate {
  readonly id: string;
  readonly label: string;
  readonly stylePrompt: string;
  readonly author?: string;
  readonly category?: string;
}

export interface CanvasCameraIdLabel {
  readonly id: string;
  readonly label: string;
}

export interface CanvasCameraOptions {
  readonly cameraBodies: CanvasCameraIdLabel[];
  readonly lenses: CanvasCameraIdLabel[];
  readonly focalLengthsMm: number[];
  readonly apertures: string[];
}

export interface CanvasGenerationCatalogGateway {
  listImageModels(projectId: string): Promise<CanvasImageModel[]>;
  listVideoModels(projectId: string): Promise<CanvasVideoModel[]>;
  getCameraOptions(projectId: string): Promise<CanvasCameraOptions>;
  listStyleTemplates(projectId: string): Promise<CanvasStyleTemplate[]>;
  listVideoCameraTemplates(
    projectId: string,
  ): Promise<CameraMovementPreset[]>;
}
