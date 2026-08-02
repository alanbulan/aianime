// Copyright (c) 2026 AI anime
import { httpCanvasGenerationCatalogGateway } from "./infrastructure/httpCanvasGenerationCatalogGateway";
import { createCanvasCameraOptionsHooks } from "./presentation/useCanvasCameraOptions";
import { createCanvasImageModelHooks } from "./presentation/useCanvasImageModels";
import { createCanvasStyleTemplateHooks } from "./presentation/useCanvasStyleTemplates";
import { createCanvasVideoCameraTemplateHooks } from "./presentation/useCanvasVideoCameraTemplates";
import { createCanvasVideoModelHooks } from "./presentation/useCanvasVideoModels";

export const { prefetchCanvasCameraOptions, useCanvasCameraOptions } =
  createCanvasCameraOptionsHooks(httpCanvasGenerationCatalogGateway);
export const { prefetchCanvasImageModels, useCanvasImageModels } =
  createCanvasImageModelHooks(httpCanvasGenerationCatalogGateway);
export const { prefetchCanvasStyleTemplates, useCanvasStyleTemplates } =
  createCanvasStyleTemplateHooks(httpCanvasGenerationCatalogGateway);
export const {
  prefetchCanvasVideoCameraTemplates,
  useCanvasVideoCameraTemplates,
} = createCanvasVideoCameraTemplateHooks(httpCanvasGenerationCatalogGateway);
export const { prefetchCanvasVideoModels, useCanvasVideoModels } =
  createCanvasVideoModelHooks(httpCanvasGenerationCatalogGateway);
