// Copyright (c) 2026 AI anime
import { freezoneGenerationCatalogGateway } from './infrastructure/freezoneGenerationCatalogGateway';

export function loadCanvasImageModels(projectId: string) {
  return freezoneGenerationCatalogGateway.listImageModels(projectId);
}

export function loadCanvasVideoModels(projectId: string) {
  return freezoneGenerationCatalogGateway.listVideoModels(projectId);
}

export function loadCanvasCameraOptions(projectId: string) {
  return freezoneGenerationCatalogGateway.getCameraOptions(projectId);
}

export function loadCanvasStyleTemplates(projectId: string) {
  return freezoneGenerationCatalogGateway.listStyleTemplates(projectId);
}

export function loadCanvasVideoCameraTemplates(projectId: string) {
  return freezoneGenerationCatalogGateway.listVideoCameraTemplates(projectId);
}
