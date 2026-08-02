// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadCommercialModelCatalog = vi.hoisted(() => vi.fn());
const resolveRequiredCatalogModelCode = vi.hoisted(() => vi.fn());

vi.mock("@/modules/model_usage/public", () => ({
  loadCommercialModelCatalog,
  resolveRequiredCatalogModelCode,
}));

vi.mock("@/modules/task_execution/public", () => ({
  awaitTaskCompletion: vi.fn(),
}));

import { resolveCanvasTextModel } from "./textGenerationComposition";

beforeEach(() => {
  loadCommercialModelCatalog.mockReset();
  resolveRequiredCatalogModelCode.mockReset();
  loadCommercialModelCatalog.mockResolvedValue({
    items: [
      { code: "text-default", operation: "TEXT", isDefault: true },
      { code: "text-pro", operation: "TEXT", isDefault: false },
      { code: "image-default", operation: "IMAGE", isDefault: true },
    ],
  });
  resolveRequiredCatalogModelCode.mockReturnValue("text-default");
});

describe("resolveCanvasTextModel", () => {
  it("keeps an explicitly authorized TEXT catalog code", async () => {
    await expect(resolveCanvasTextModel(" text-pro ")).resolves.toBe(
      "text-pro",
    );
    expect(loadCommercialModelCatalog).toHaveBeenCalledWith("TEXT");
    expect(resolveRequiredCatalogModelCode).not.toHaveBeenCalled();
  });

  it("falls back to the catalog's required TEXT model", async () => {
    await expect(resolveCanvasTextModel("unknown-model")).resolves.toBe(
      "text-default",
    );
    expect(resolveRequiredCatalogModelCode).toHaveBeenCalledWith(
      expect.objectContaining({ items: expect.any(Array) }),
      "TEXT",
    );
  });
});
