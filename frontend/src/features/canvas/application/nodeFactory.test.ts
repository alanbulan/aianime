// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  CANVAS_NODE_TYPES,
  type CanvasNodeData,
} from "../domain/canvasNodes";
import type { CanvasNodeDefinition } from "../domain/nodeRegistry";
import { CanvasNodeFactory } from "./nodeFactory";
import type {
  CanvasNodeDefaultDataGateway,
  NodeCatalog,
} from "./ports";

const catalog: NodeCatalog = {
  getDefinition: (type) =>
    ({
      type,
      createDefaultData: () => ({ model: "default-model" }),
    }) as CanvasNodeDefinition,
  getMenuDefinitions: () => [],
};

describe("CanvasNodeFactory", () => {
  it("applies runtime defaults before explicit node data", () => {
    const gateway: CanvasNodeDefaultDataGateway = {
      getOverrides: vi.fn().mockReturnValue({ model: "remembered-model" }),
    };
    const factory = new CanvasNodeFactory(
      { next: () => "node-1" },
      catalog,
      gateway,
    );

    const preferred = factory.createNode(
      CANVAS_NODE_TYPES.video,
      { x: 10, y: 20 },
    );
    const explicit = factory.createNode(
      CANVAS_NODE_TYPES.video,
      { x: 30, y: 40 },
      { model: "explicit-model" } as Partial<CanvasNodeData>,
    );

    expect(preferred.data).toMatchObject({ model: "remembered-model" });
    expect(explicit.data).toMatchObject({ model: "explicit-model" });
  });
});
