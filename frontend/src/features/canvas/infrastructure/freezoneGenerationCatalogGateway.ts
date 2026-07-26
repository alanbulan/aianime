// Copyright (c) 2026 AI anime
import {
  fetchFreezoneCameraOptions,
  fetchFreezoneImageModels,
  fetchFreezoneVideoCameraTemplates,
  fetchFreezoneVideoModels,
  listFreezoneStyleTemplates,
  type FreezoneCameraOptions,
  type FreezoneImageModelInfo,
  type FreezoneStyleTemplate,
  type FreezoneVideoModelInfo,
} from "@/api/ops";

import type {
  CanvasCameraOptions,
  CanvasGenerationCatalogGateway,
  CanvasImageModel,
  CanvasStyleTemplate,
  CanvasVideoModel,
} from "../application/generationCatalog";

function mapImageModel(model: FreezoneImageModelInfo): CanvasImageModel {
  return {
    id: model.id,
    providerId: model.providerId,
    apiModel: model.apiModel,
    label: model.label,
  };
}

function mapVideoModel(model: FreezoneVideoModelInfo): CanvasVideoModel {
  return {
    id: model.id,
    providerId: model.providerId,
    apiModel: model.apiModel,
    label: model.label,
    ...(model.resolutionOptions
      ? { resolutionOptions: [...model.resolutionOptions] }
      : {}),
    ...(model.minDuration !== undefined
      ? { minDuration: model.minDuration }
      : {}),
    ...(model.maxDuration !== undefined
      ? { maxDuration: model.maxDuration }
      : {}),
    ...(model.sceneOptimizeOptions
      ? { sceneOptimizeOptions: [...model.sceneOptimizeOptions] }
      : {}),
    ...(model.defaultSceneOptimize !== undefined
      ? { defaultSceneOptimize: model.defaultSceneOptimize }
      : {}),
  };
}

function mapCameraOptions(options: FreezoneCameraOptions): CanvasCameraOptions {
  return {
    cameraBodies: options.camera_bodies,
    lenses: options.lenses,
    focalLengthsMm: options.focal_lengths_mm,
    apertures: options.apertures,
  };
}

function mapStyleTemplate(
  template: FreezoneStyleTemplate,
): CanvasStyleTemplate {
  return {
    id: template.id,
    label: template.label,
    stylePrompt: template.style_prompt,
    ...(template.author !== undefined ? { author: template.author } : {}),
    ...(template.category !== undefined
      ? { category: template.category }
      : {}),
  };
}

export const freezoneGenerationCatalogGateway: CanvasGenerationCatalogGateway = {
  async listImageModels(projectId) {
    return (await fetchFreezoneImageModels(projectId)).map(mapImageModel);
  },
  async listVideoModels(projectId) {
    return (await fetchFreezoneVideoModels(projectId)).map(mapVideoModel);
  },
  async getCameraOptions(projectId) {
    return mapCameraOptions(await fetchFreezoneCameraOptions(projectId));
  },
  async listStyleTemplates(projectId) {
    return (await listFreezoneStyleTemplates(projectId)).map(mapStyleTemplate);
  },
  async listVideoCameraTemplates(projectId) {
    return await fetchFreezoneVideoCameraTemplates(projectId);
  },
};
