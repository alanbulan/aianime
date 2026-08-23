// Copyright (c) 2026 AI anime
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COMMERCIAL_MODEL_ACCESS_CHANGED_EVENT } from "@/modules/model_usage/public";
import type { CanvasGenerationCatalogGateway } from "../application/generationCatalog";
import { createCanvasCameraOptionsHooks } from "./useCanvasCameraOptions";
import { createCanvasImageModelHooks } from "./useCanvasImageModels";
import { createCanvasStyleTemplateHooks } from "./useCanvasStyleTemplates";
import { createCanvasVideoCameraTemplateHooks } from "./useCanvasVideoCameraTemplates";
import { createCanvasVideoModelHooks } from "./useCanvasVideoModels";

function createGateway(): CanvasGenerationCatalogGateway {
  return {
    listImageModels: vi.fn().mockResolvedValue([
      {
        id: "generation-model",
        apiModel: "generation-model",
        label: "Generation",
        imageModes: ["generation"],
        capabilities: {},
        parameterSchema: {},
      },
      {
        id: "edit-model",
        apiModel: "edit-model",
        label: "Edit",
        imageModes: ["edit"],
        capabilities: {},
        parameterSchema: {},
      },
    ]),
    listVideoModels: vi.fn().mockResolvedValue([
      {
        id: "video-model",
        apiModel: "video-model",
        label: "Video",
      },
    ]),
    getCameraOptions: vi.fn().mockResolvedValue({
      cameraBodies: [{ id: "arri", label: "ARRI" }],
      lenses: [],
      focalLengthsMm: [35],
      apertures: ["f/2.8"],
    }),
    listStyleTemplates: vi.fn().mockResolvedValue([
      { id: "anime", label: "Anime", stylePrompt: "anime style" },
    ]),
    listVideoCameraTemplates: vi.fn().mockResolvedValue([
      {
        id: "dolly-in",
        label: "Dolly In",
        promptFragment: "camera pushes in",
        videoUrl: null,
      },
    ]),
  };
}

describe("Canvas generation catalog hooks", () => {
  it("shares one image request per project and filters the authorized role", async () => {
    const gateway = createGateway();
    const hooks = createCanvasImageModelHooks(gateway);
    hooks.prefetchCanvasImageModels("project-a");

    const first = renderHook(() =>
      hooks.useCanvasImageModels("project-a", "edit"),
    );
    const second = renderHook(() =>
      hooks.useCanvasImageModels("project-a", "generation"),
    );

    await waitFor(() => {
      expect(first.result.current.models.map((model) => model.id)).toEqual([
        "edit-model",
      ]);
      expect(second.result.current.models.map((model) => model.id)).toEqual([
        "generation-model",
      ]);
    });
    expect(gateway.listImageModels).toHaveBeenCalledTimes(1);
  });

  it("invalidates model snapshots when commercial access changes", async () => {
    const gateway = createGateway();
    const hooks = createCanvasVideoModelHooks(gateway);
    const hook = renderHook(() => hooks.useCanvasVideoModels("project-a"));

    await waitFor(() => {
      expect(hook.result.current.models).toHaveLength(1);
    });
    act(() => {
      window.dispatchEvent(new Event(COMMERCIAL_MODEL_ACCESS_CHANGED_EVENT));
    });
    await waitFor(() => {
      expect(gateway.listVideoModels).toHaveBeenCalledTimes(2);
    });
  });

  it("loads camera, style, and movement catalogs through the injected port", async () => {
    const gateway = createGateway();
    const cameraHooks = createCanvasCameraOptionsHooks(gateway);
    const styleHooks = createCanvasStyleTemplateHooks(gateway);
    const movementHooks = createCanvasVideoCameraTemplateHooks(gateway);
    const hook = renderHook(() => ({
      camera: cameraHooks.useCanvasCameraOptions("project-a"),
      styles: styleHooks.useCanvasStyleTemplates("project-a"),
      movements:
        movementHooks.useCanvasVideoCameraTemplates("project-a"),
    }));

    await waitFor(() => {
      expect(hook.result.current.camera.options?.cameraBodies[0]?.id).toBe(
        "arri",
      );
      expect(hook.result.current.styles.templates[0]?.id).toBe("anime");
      expect(hook.result.current.movements.templates[0]?.id).toBe("dolly-in");
    });
    expect(gateway.getCameraOptions).toHaveBeenCalledWith("project-a");
    expect(gateway.listStyleTemplates).toHaveBeenCalledWith("project-a");
    expect(gateway.listVideoCameraTemplates).toHaveBeenCalledWith("project-a");
  });

  it("retries a failed style catalog request only after an explicit action", async () => {
    const gateway = createGateway();
    vi.mocked(gateway.listStyleTemplates)
      .mockRejectedValueOnce(new Error("catalog unavailable"))
      .mockResolvedValueOnce([
        { id: "anime", label: "Anime", stylePrompt: "anime style" },
      ]);
    const hooks = createCanvasStyleTemplateHooks(gateway);
    const hook = renderHook(() =>
      hooks.useCanvasStyleTemplates("retry-project"),
    );

    await waitFor(() => {
      expect(hook.result.current.error?.message).toBe("catalog unavailable");
    });
    expect(gateway.listStyleTemplates).toHaveBeenCalledTimes(1);

    act(() => hook.result.current.retry());
    await waitFor(() => {
      expect(hook.result.current.templates[0]?.id).toBe("anime");
    });
    expect(gateway.listStyleTemplates).toHaveBeenCalledTimes(2);
  });
});
