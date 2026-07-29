// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  useCanvasPresetRefreshController,
  type CanvasPresetRefreshControllerOptions,
} from "./useCanvasPresetRefreshController";

const mocks = vi.hoisted(() => ({
  refreshCanvasPreset: vi.fn(),
  userEditsSinceHydrate: 3,
}));

vi.mock("@/features/canvas/canvasStore", () => ({
  useCanvasStore: {
    getState: () => ({
      userEditsSinceHydrate: mocks.userEditsSinceHydrate,
    }),
  },
}));

vi.mock("../canvasPresetRefreshComposition", () => ({
  refreshCanvasPreset: mocks.refreshCanvasPreset,
}));

function createOptions(
  overrides: Partial<CanvasPresetRefreshControllerOptions> = {},
): CanvasPresetRefreshControllerOptions {
  return {
    project: "project-a",
    canvasId: "preset-a",
    metadata: { preset: { scope: "beat", episode: 1, beat: 2 } },
    revision: 7,
    hydratedCanvasId: "preset-a",
    revisionRef: { current: 8 },
    flush: vi.fn(async () => true),
    reload: vi.fn(),
    setStatus: vi.fn(),
    setError: vi.fn(),
    ...overrides,
  };
}

describe("canvas preset refresh controller", () => {
  beforeEach(() => {
    mocks.userEditsSinceHydrate = 3;
    mocks.refreshCanvasPreset.mockReset().mockResolvedValue("preset-a");
  });

  it("projects current sync and Store state into the preset refresh use case", async () => {
    const options = createOptions();
    const hook = renderHook(() => useCanvasPresetRefreshController(options));
    let result = "";

    await act(async () => {
      result = await hook.result.current.restoreMainlineDefault({
        bestEffort: true,
      });
    });

    expect(result).toBe("preset-a");
    expect(mocks.refreshCanvasPreset).toHaveBeenCalledWith({
      project: "project-a",
      canvasId: "preset-a",
      preset: { scope: "beat", episode: 1, beat: 2 },
      revision: 7,
      hydratedCanvasId: "preset-a",
      userEditsSinceHydrate: 3,
      bestEffort: true,
      readRevision: expect.any(Function),
      flush: options.flush,
      reload: options.reload,
      setStatus: options.setStatus,
      setError: options.setError,
    });
    const args = mocks.refreshCanvasPreset.mock.calls[0][0];
    expect(args.readRevision()).toBe(8);
    options.revisionRef.current = 9;
    expect(args.readRevision()).toBe(9);
  });
});
