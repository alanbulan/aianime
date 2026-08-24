// Copyright (c) 2026 AI anime
import type { ProductionVideoGateway } from "@/modules/production/application/ports";
import { commercialModelRoles } from "@/modules/model_usage/public";
import {
  imageModelOptionsFromCatalog,
  resolveAuthorizedImageModel,
} from "@/modules/production/domain/image-model";

interface ProductionImageCatalog {
  items: ReadonlyArray<{
    code: string;
    displayName: string;
    operation: string;
    capabilities: Record<string, unknown>;
  }>;
}

export interface ProductionImageCatalogLoader {
  load(operation: "IMAGE"): Promise<ProductionImageCatalog>;
}

export class ProductionImageModelUnavailableError extends Error {
  constructor() {
    super(
      "当前图片模型不支持参考图编辑，请选择支持 IMAGE_EDIT 的云端或 BYOK 模型",
    );
    this.name = "ProductionImageModelUnavailableError";
  }
}

export function createAuthorizedProductionImageGateway(
  gateway: ProductionVideoGateway,
  catalogLoader: ProductionImageCatalogLoader,
): ProductionVideoGateway {
  const resolveSelection = async (
    project: string,
    kind: "render" | "sketch",
    requested?: string,
  ): Promise<string> => {
    const persistedSelection = requested
      ? Promise.resolve("")
      : kind === "render"
        ? gateway
            .getRenderSettings(project)
            .then((settings) => settings.data.render_image_selection)
        : gateway
            .getSketchSettings(project)
            .then((settings) => settings.data.sketch_image_selection);
    const [catalog, persisted] = await Promise.all([
      catalogLoader.load("IMAGE"),
      persistedSelection,
    ]);
    const imageItems = catalog.items.filter(
      (item) =>
        item.operation.trim().toUpperCase() === "IMAGE" &&
        commercialModelRoles(item).includes("IMAGE_EDIT"),
    );
    const selection = resolveAuthorizedImageModel(
      imageModelOptionsFromCatalog(imageItems),
      requested || persisted,
    );
    if (!selection) {
      throw new ProductionImageModelUnavailableError();
    }
    return selection;
  };

  return {
    ...gateway,
    async generateSketches(project, episode, command = {}) {
      const imageGenerationSelection = await resolveSelection(
        project,
        "sketch",
        command.imageGenerationSelection,
      );
      return gateway.generateSketches(project, episode, {
        ...command,
        imageGenerationSelection,
      });
    },
    async regenerateGrid(project, episode, command) {
      const imageGenerationSelection = await resolveSelection(
        project,
        "render",
        command.imageGenerationSelection,
      );
      return gateway.regenerateGrid(project, episode, {
        ...command,
        imageGenerationSelection,
      });
    },
    async regenerateSketches(project, episode, command) {
      const imageGenerationSelection = await resolveSelection(
        project,
        "sketch",
        command.imageGenerationSelection,
      );
      return gateway.regenerateSketches(project, episode, {
        ...command,
        imageGenerationSelection,
      });
    },
    async regenerateRenderBeats(project, episode, command) {
      const imageGenerationSelection = await resolveSelection(
        project,
        "render",
        command.imageGenerationSelection,
      );
      return gateway.regenerateRenderBeats(project, episode, {
        ...command,
        imageGenerationSelection,
      });
    },
    async createRenderPlan(project, episode, command) {
      const imageGenerationSelection = await resolveSelection(
        project,
        "render",
        command.imageGenerationSelection,
      );
      return gateway.createRenderPlan(project, episode, {
        ...command,
        imageGenerationSelection,
      });
    },
    async executeRenderPlan(project, episode, command) {
      const imageGenerationSelection = await resolveSelection(
        project,
        "render",
        command.imageGenerationSelection,
      );
      return gateway.executeRenderPlan(project, episode, {
        ...command,
        imageGenerationSelection,
      });
    },
  };
}
