// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createUseCanvasPresetRefreshController,
  type CanvasPresetRefreshControllerOptions,
} from "./useCanvasPresetRefreshController";

const refreshCanvasPreset = vi.fn();
const useCanvasPresetRefreshController =
  createUseCanvasPresetRefreshController(refreshCanvasPreset);

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
    readUserEditsSinceHydrate: () => 3,
    flush: vi.fn(async () => true),
    reload: vi.fn(),
    setStatus: vi.fn(),
    setError: vi.fn(),
    ...overrides,
  };
}

describe("canvas preset refresh controller", () => {
  beforeEach(() => {
    refreshCanvasPreset.mockReset().mockResolvedValue("preset-a");
  });

  it("projects current sync and Store ports into the preset refresh use case", async () => {
    let userEditsSinceHydrate = 3;
    const options = createOptions({
      readUserEditsSinceHydrate: () => userEditsSinceHydrate,
    });
    const hook = renderHook(() => useCanvasPresetRefreshController(options));
    let result = "";

    await act(async () => {
      result = await hook.result.current.restoreMainlineDefault({
        bestEffort: true,
      });
    });

    expect(result).toBe("preset-a");
    expect(refreshCanvasPreset).toHaveBeenCalledWith({
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
    const args = refreshCanvasPreset.mock.calls[0][0];
    expect(args.readRevision()).toBe(8);
    options.revisionRef.current = 9;
    userEditsSinceHydrate = 4;
    expect(args.readRevision()).toBe(9);

    await act(async () => {
      await hook.result.current.restoreMainlineDefault();
    });
    expect(refreshCanvasPreset.mock.calls[1][0].userEditsSinceHydrate).toBe(4);
  });
});
