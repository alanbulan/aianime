// Copyright (c) 2026 AI anime
import type { CameraMovementPreset } from "../domain/cameraMovementPresets";
import type { VideoGenMode } from "../domain/canvasNodes";
import type { CanvasImageMode } from "../domain/imageModelCapability";

export interface CanvasImageModel {
  readonly id: string;
  readonly apiModel: string;
  readonly label: string;
  readonly imageModes?: ReadonlyArray<CanvasImageMode>;
  readonly capabilities: Record<string, unknown>;
  readonly parameterSchema: Record<string, unknown>;
}

export interface CanvasVideoModel {
  readonly id: string;
  readonly apiModel: string;
  readonly label: string;
  readonly supportedModes?: VideoGenMode[];
  readonly supportsHumanReview?: boolean;
  readonly supportsReferenceImages?: boolean;
  readonly supportsReferenceVideos?: boolean;
  readonly supportsReferenceAudios?: boolean;
  readonly maxReferenceImages?: number | null;
  readonly maxReferenceVideos?: number | null;
  readonly maxReferenceAudios?: number | null;
  readonly maxReferenceTotal?: number | null;
  readonly maxReferenceAudioDurationSeconds?: number | null;
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
