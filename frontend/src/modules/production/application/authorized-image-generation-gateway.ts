// Copyright (c) 2026 AI anime
import type { ProductionVideoGateway } from "@/modules/production/application/ports";

interface ProductionImageCatalog {
  items: ReadonlyArray<{
    code: string;
    operation: string;
  }>;
}

export interface ProductionImageCatalogLoader {
  load(operation: "IMAGE"): Promise<ProductionImageCatalog>;
}

export class ProductionImageModelUnavailableError extends Error {
  constructor() {
    super("The saved image model is not authorized by the active model catalog");
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
    const selection = (requested || persisted).trim();
    const authorized = catalog.items.some(
      (item) =>
        item.operation.trim().toUpperCase() === "IMAGE" &&
        item.code.trim() === selection,
    );
    if (!selection || !authorized) {
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
