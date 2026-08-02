// Copyright (c) 2026 AI anime
import type { CameraMovementPreset } from "../domain/cameraMovementPresets";
import type { CanvasImageMode } from "../domain/imageModelCapability";
import type { VideoGenMode } from "../domain/videoGenerationMode";

export interface CanvasCatalogModelOption {
  readonly id: string;
  readonly apiModel: string;
  readonly label: string;
  readonly capabilities?: Record<string, unknown>;
  readonly imageModes?: ReadonlyArray<CanvasImageMode>;
  readonly parameterSchema?: Record<string, unknown>;
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

export interface CanvasImageModel extends CanvasCatalogModelOption {
  readonly capabilities: Record<string, unknown>;
  readonly parameterSchema: Record<string, unknown>;
}

export type CanvasVideoModel = CanvasCatalogModelOption;

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

export function listCanvasImageModels(
  projectId: string,
  gateway: CanvasGenerationCatalogGateway,
): Promise<CanvasImageModel[]> {
  return gateway.listImageModels(projectId);
}

export function listCanvasVideoModels(
  projectId: string,
  gateway: CanvasGenerationCatalogGateway,
): Promise<CanvasVideoModel[]> {
  return gateway.listVideoModels(projectId);
}

export function getCanvasCameraOptions(
  projectId: string,
  gateway: CanvasGenerationCatalogGateway,
): Promise<CanvasCameraOptions> {
  return gateway.getCameraOptions(projectId);
}

export function listCanvasStyleTemplates(
  projectId: string,
  gateway: CanvasGenerationCatalogGateway,
): Promise<CanvasStyleTemplate[]> {
  return gateway.listStyleTemplates(projectId);
}

export function listCanvasVideoCameraTemplates(
  projectId: string,
  gateway: CanvasGenerationCatalogGateway,
): Promise<CameraMovementPreset[]> {
  return gateway.listVideoCameraTemplates(projectId);
}
