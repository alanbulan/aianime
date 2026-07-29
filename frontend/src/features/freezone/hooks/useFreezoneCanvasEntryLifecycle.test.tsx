// Copyright (c) 2026 AI anime
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCanvasStore, type CanvasNode } from "@/features/canvas/canvasStore";

import {
  useFreezoneCanvasEntryLifecycle,
  type FreezoneCanvasEntryLifecycleOptions,
} from "./useFreezoneCanvasEntryLifecycle";

const mocks = vi.hoisted(() => ({
  currentCanvasParam: vi.fn(),
  prefetchFreezoneCameraOptions: vi.fn(),
  prefetchFreezoneImageModels: vi.fn(),
  prefetchFreezoneStyleTemplates: vi.fn(),
  prefetchFreezoneVideoCameraTemplates: vi.fn(),
  prefetchFreezoneVideoModels: vi.fn(),
  rememberLastCanvas: vi.fn(),
  writeUrl: vi.fn(),
}));

vi.mock("@/features/canvas/hooks/useFreezoneCameraOptions", () => ({
  prefetchFreezoneCameraOptions: mocks.prefetchFreezoneCameraOptions,
}));

vi.mock("@/features/canvas/hooks/useFreezoneImageModels", () => ({
  prefetchFreezoneImageModels: mocks.prefetchFreezoneImageModels,
}));

vi.mock("@/features/canvas/hooks/useFreezoneStyleTemplates", () => ({
  prefetchFreezoneStyleTemplates: mocks.prefetchFreezoneStyleTemplates,
}));

vi.mock("@/features/canvas/hooks/useFreezoneVideoCameraTemplates", () => ({
  prefetchFreezoneVideoCameraTemplates: mocks.prefetchFreezoneVideoCameraTemplates,
}));

vi.mock("@/features/canvas/hooks/useFreezoneVideoModels", () => ({
  prefetchFreezoneVideoModels: mocks.prefetchFreezoneVideoModels,
}));

vi.mock("@/lib/app-router", () => ({
  currentCanvasParam: mocks.currentCanvasParam,
}));

vi.mock("@/lib/url-params", () => ({
  rememberLastCanvas: mocks.rememberLastCanvas,
  writeUrl: mocks.writeUrl,
}));

function options(
  overrides: Partial<FreezoneCanvasEntryLifecycleOptions> = {},
): FreezoneCanvasEntryLifecycleOptions {
  return {
    projectId: "entry-project",
    canvasId: "user-entry",
    hydratedCanvasId: null,
    syncStatus: "loading",
    ...overrides,
  };
}

describe("Freezone canvas entry lifecycle", () => {
  beforeEach(() => {
    useCanvasStore.setState({ nodes: [], edges: [] });
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.currentCanvasParam.mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    useCanvasStore.setState({ nodes: [], edges: [] });
  });

  it("prefetches project resources and reuses a rendered canvas on re-entry", () => {
    const initial = options();
    const hook = renderHook(
      (props: FreezoneCanvasEntryLifecycleOptions) =>
        useFreezoneCanvasEntryLifecycle(props),
      { initialProps: initial },
    );

    expect(hook.result.current).toEqual({
      showBlockingLoading: true,
      showLoadingOverlay: false,
    });
    expect(mocks.prefetchFreezoneImageModels).toHaveBeenCalledWith("entry-project");
    expect(mocks.prefetchFreezoneVideoModels).toHaveBeenCalledWith("entry-project");
    expect(mocks.prefetchFreezoneCameraOptions).toHaveBeenCalledWith("entry-project");
    expect(mocks.prefetchFreezoneStyleTemplates).toHaveBeenCalledWith("entry-project");
    expect(mocks.prefetchFreezoneVideoCameraTemplates).toHaveBeenCalledWith(
      "entry-project",
    );
    expect(mocks.rememberLastCanvas).toHaveBeenCalledWith(
      "entry-project",
      "user-entry",
    );
    expect(mocks.writeUrl).toHaveBeenCalledWith(
      { canvas: "user-entry" },
      { replace: true, notify: false },
    );

    hook.rerender(options({
      hydratedCanvasId: "user-entry",
      syncStatus: "ready",
    }));
    expect(hook.result.current).toEqual({
      showBlockingLoading: false,
      showLoadingOverlay: false,
    });

    hook.rerender(options());
    expect(hook.result.current).toEqual({
      showBlockingLoading: false,
      showLoadingOverlay: true,
    });

    act(() => {
      useCanvasStore.setState({
        nodes: [{ id: "persisted-node" } as CanvasNode],
      });
    });
    hook.unmount();
    const remount = renderHook(() =>
      useFreezoneCanvasEntryLifecycle(options()));
    expect(remount.result.current).toEqual({
      showBlockingLoading: false,
      showLoadingOverlay: true,
    });
  });

  it("does not rewrite a current or default canvas URL", () => {
    mocks.currentCanvasParam.mockReturnValue("user-current");
    const hook = renderHook(
      (props: FreezoneCanvasEntryLifecycleOptions) =>
        useFreezoneCanvasEntryLifecycle(props),
      {
        initialProps: options({
          projectId: "url-project",
          canvasId: "user-current",
        }),
      },
    );

    expect(mocks.writeUrl).not.toHaveBeenCalled();
    hook.rerender(options({
      projectId: "url-project",
      canvasId: "default",
    }));
    expect(mocks.writeUrl).not.toHaveBeenCalled();
    expect(mocks.rememberLastCanvas).toHaveBeenLastCalledWith(
      "url-project",
      "default",
    );

    hook.rerender(options({
      projectId: "url-project-next",
      canvasId: "default",
    }));
    expect(mocks.prefetchFreezoneImageModels).toHaveBeenCalledTimes(2);
    expect(mocks.prefetchFreezoneImageModels).toHaveBeenLastCalledWith(
      "url-project-next",
    );
  });
});
