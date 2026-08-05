// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type {
  CanvasNodeDefaultDataGateway,
  CanvasNodeDefaultDataCatalog,
} from "./canvasNodeDefaultData";
import { CanvasNodeFactory } from "./nodeFactory";

const catalog: CanvasNodeDefaultDataCatalog = {
  getDefinition: (type) =>
    ({
      type,
      createDefaultData: () => ({ model: "default-model" }),
    }),
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
      "videoNode",
      { x: 10, y: 20 },
    );
    const explicit = factory.createNode(
      "videoNode",
      { x: 30, y: 40 },
      { model: "explicit-model" },
    );

    expect(preferred.data).toMatchObject({ model: "remembered-model" });
    expect(explicit.data).toMatchObject({ model: "explicit-model" });
  });
});
