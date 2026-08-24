// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { ProductionVideoGateway } from "@/modules/production/application/ports";
import {
  createAuthorizedProductionImageGateway,
  ProductionImageModelUnavailableError,
} from "@/modules/production/application/authorized-image-generation-gateway";

function gatewayStub(
  overrides: Partial<ProductionVideoGateway>,
): ProductionVideoGateway {
  return overrides as ProductionVideoGateway;
}

describe("authorized production image gateway", () => {
  it("blocks a persisted SKU that is absent after an account or mode switch", async () => {
    const regenerateSketches = vi.fn();
    const gateway = gatewayStub({
      getSketchSettings: vi.fn().mockResolvedValue({
        ok: true,
        data: { sketch_image_selection: "old/byok-image" },
      }),
      regenerateSketches,
    });
    const guarded = createAuthorizedProductionImageGateway(gateway, {
      load: vi.fn().mockResolvedValue({
        items: [
          {
            code: "cloud/image-current",
            operation: "IMAGE",
            capabilities: { supportedModes: ["IMAGE_EDIT"] },
          },
        ],
      }),
    });

    await expect(
      guarded.regenerateSketches("demo", 1, {
        beatIndices: [1],
        modeKey: "1x1_2-3_sketch",
      }),
    ).rejects.toBeInstanceOf(ProductionImageModelUnavailableError);
    expect(regenerateSketches).not.toHaveBeenCalled();
  });

  it("injects the currently authorized project SKU into sketch requests", async () => {
    const regenerateSketches = vi.fn().mockResolvedValue({ ok: true });
    const gateway = gatewayStub({
      getSketchSettings: vi.fn().mockResolvedValue({
        ok: true,
        data: { sketch_image_selection: "cloud/image-current" },
      }),
      regenerateSketches,
    });
    const guarded = createAuthorizedProductionImageGateway(gateway, {
      load: vi.fn().mockResolvedValue({
        items: [
          {
            code: "cloud/image-current",
            operation: "IMAGE",
            capabilities: { supportedModes: ["IMAGE_EDIT"] },
          },
        ],
      }),
    });

    await guarded.regenerateSketches("demo", 2, {
      beatIndices: [3],
      modeKey: "1x1_2-3_sketch",
    });

    expect(regenerateSketches).toHaveBeenCalledWith("demo", 2, {
      beatIndices: [3],
      modeKey: "1x1_2-3_sketch",
      imageGenerationSelection: "cloud/image-current",
    });
  });

  it("validates an explicit render SKU without reading stale project settings", async () => {
    const getRenderSettings = vi.fn();
    const createRenderPlan = vi.fn().mockResolvedValue({ ok: true });
    const gateway = gatewayStub({ createRenderPlan, getRenderSettings });
    const guarded = createAuthorizedProductionImageGateway(gateway, {
      load: vi.fn().mockResolvedValue({
        items: [
          {
            code: "user-image-model",
            operation: "IMAGE",
            capabilities: { supportedModes: ["IMAGE_EDIT"] },
          },
        ],
      }),
    });

    await guarded.createRenderPlan("demo", 4, {
      aspectMode: "16:9",
      beatIndices: [1],
      imageGenerationSelection: "user-image-model",
      strategy: "location",
    });

    expect(getRenderSettings).not.toHaveBeenCalled();
    expect(createRenderPlan).toHaveBeenCalledWith("demo", 4, {
      aspectMode: "16:9",
      beatIndices: [1],
      imageGenerationSelection: "user-image-model",
      strategy: "location",
    });
  });

  it("blocks an IMAGE model that does not support reference-image editing", async () => {
    const regenerateRenderBeats = vi.fn();
    const gateway = gatewayStub({
      getRenderSettings: vi.fn().mockResolvedValue({
        ok: true,
        data: { render_image_selection: "cloud:generation-only" },
      }),
      regenerateRenderBeats,
    });
    const guarded = createAuthorizedProductionImageGateway(gateway, {
      load: vi.fn().mockResolvedValue({
        items: [
          {
            code: "generation-only",
            operation: "IMAGE",
            capabilities: {
              routeSelector: "cloud:generation-only",
              supportedModes: ["TEXT_TO_IMAGE"],
            },
          },
        ],
      }),
    });

    await expect(
      guarded.regenerateRenderBeats("demo", 1, {
        beatIndices: [1],
        modeKey: "1x1_2-3",
      }),
    ).rejects.toBeInstanceOf(ProductionImageModelUnavailableError);
    expect(regenerateRenderBeats).not.toHaveBeenCalled();
  });
});
