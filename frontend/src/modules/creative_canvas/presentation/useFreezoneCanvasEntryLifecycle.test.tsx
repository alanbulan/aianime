// Copyright (c) 2026 AI anime
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createUseFreezoneCanvasEntryLifecycle,
  type FreezoneCanvasEntryLifecycleOptions,
} from "./useFreezoneCanvasEntryLifecycle";

const mocks = {
  readCanvasNodeCount: vi.fn(),
  readCurrentCanvasParam: vi.fn(),
  prefetchCameraOptions: vi.fn(),
  prefetchImageModels: vi.fn(),
  prefetchStyleTemplates: vi.fn(),
  prefetchVideoCameraTemplates: vi.fn(),
  prefetchVideoModels: vi.fn(),
  rememberLastCanvas: vi.fn(),
  replaceCanvasParam: vi.fn(),
};

let useFreezoneCanvasEntryLifecycle: ReturnType<
  typeof createUseFreezoneCanvasEntryLifecycle
>;

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
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.readCanvasNodeCount.mockReturnValue(0);
    mocks.readCurrentCanvasParam.mockReturnValue(null);
    useFreezoneCanvasEntryLifecycle =
      createUseFreezoneCanvasEntryLifecycle(mocks);
  });

  afterEach(() => {
    cleanup();
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
    expect(mocks.prefetchImageModels).toHaveBeenCalledWith("entry-project");
    expect(mocks.prefetchVideoModels).toHaveBeenCalledWith("entry-project");
    expect(mocks.prefetchCameraOptions).toHaveBeenCalledWith("entry-project");
    expect(mocks.prefetchStyleTemplates).toHaveBeenCalledWith("entry-project");
    expect(mocks.prefetchVideoCameraTemplates).toHaveBeenCalledWith(
      "entry-project",
    );
    expect(mocks.rememberLastCanvas).toHaveBeenCalledWith(
      "entry-project",
      "user-entry",
    );
    expect(mocks.replaceCanvasParam).toHaveBeenCalledWith("user-entry");

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
      mocks.readCanvasNodeCount.mockReturnValue(1);
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
    mocks.readCurrentCanvasParam.mockReturnValue("user-current");
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

    expect(mocks.replaceCanvasParam).not.toHaveBeenCalled();
    hook.rerender(options({
      projectId: "url-project",
      canvasId: "default",
    }));
    expect(mocks.replaceCanvasParam).not.toHaveBeenCalled();
    expect(mocks.rememberLastCanvas).toHaveBeenLastCalledWith(
      "url-project",
      "default",
    );

    hook.rerender(options({
      projectId: "url-project-next",
      canvasId: "default",
    }));
    expect(mocks.prefetchImageModels).toHaveBeenCalledTimes(2);
    expect(mocks.prefetchImageModels).toHaveBeenLastCalledWith(
      "url-project-next",
    );
  });
});
