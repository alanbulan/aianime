// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  createCanvasPresetRefresher,
  type CanvasPresetRefreshArgs,
  type CanvasPresetRefreshDependencies,
} from "./canvasPresetRefresh";

function args(
  overrides: Partial<CanvasPresetRefreshArgs> = {},
): CanvasPresetRefreshArgs {
  return {
    project: "project-a",
    canvasId: "canvas-a",
    preset: { scope: "beat", episode: 1, beat: 4 },
    revision: 7,
    hydratedCanvasId: "canvas-a",
    userEditsSinceHydrate: 0,
    readRevision: () => 7,
    flush: vi.fn(async () => true),
    reload: vi.fn(),
    setStatus: vi.fn(),
    setError: vi.fn(),
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<CanvasPresetRefreshDependencies> = {},
): CanvasPresetRefreshDependencies {
  return {
    createCanvasFromPreset: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("canvas preset refresh", () => {
  it("rejects non-restorable metadata without changing sync state", async () => {
    const input = args({ preset: { scope: "blank" } });
    const createCanvasFromPreset = vi.fn();
    const refresh = createCanvasPresetRefresher(
      dependencies({ createCanvasFromPreset }),
    );

    await expect(refresh(input)).rejects.toThrow(
      "当前画布不是可恢复的主线 preset",
    );

    expect(createCanvasFromPreset).not.toHaveBeenCalled();
    expect(input.setStatus).not.toHaveBeenCalled();
    expect(input.setError).not.toHaveBeenCalled();
  });

  it("defers best-effort refresh until the current canvas is hydrated", async () => {
    const input = args({
      bestEffort: true,
      revision: null,
      hydratedCanvasId: "other-canvas",
    });
    const createCanvasFromPreset = vi.fn();
    const refresh = createCanvasPresetRefresher(
      dependencies({ createCanvasFromPreset }),
    );

    await expect(refresh(input)).resolves.toBe("canvas-a");

    expect(input.flush).not.toHaveBeenCalled();
    expect(createCanvasFromPreset).not.toHaveBeenCalled();
    expect(input.setStatus).not.toHaveBeenCalled();
  });

  it("skips flush for a clean best-effort refresh and uses the latest revision", async () => {
    const createCanvasFromPreset = vi.fn(async () => undefined);
    const input = args({
      bestEffort: true,
      readRevision: () => 8,
    });
    const refresh = createCanvasPresetRefresher(
      dependencies({ createCanvasFromPreset }),
    );

    await expect(refresh(input)).resolves.toBe("canvas-a");

    expect(input.flush).not.toHaveBeenCalled();
    expect(createCanvasFromPreset).toHaveBeenCalledWith("project-a", {
      scope: "beat",
      episode: 1,
      beat: 4,
      primary_slot: "render",
      asset_kind: null,
      character: null,
      identity_id: null,
      asset_id: null,
      canvas_id: "canvas-a",
      overwrite_existing: true,
      base_revision: 8,
    });
    expect(input.reload).toHaveBeenCalledTimes(1);
    expect(input.setStatus).toHaveBeenCalledWith("saving");
    expect(input.setError).toHaveBeenCalledWith(null);
  });

  it("silently aborts a dirty best-effort refresh when flush is blocked", async () => {
    const input = args({
      bestEffort: true,
      userEditsSinceHydrate: 1,
      flush: vi.fn(async () => false),
    });
    const createCanvasFromPreset = vi.fn();
    const refresh = createCanvasPresetRefresher(
      dependencies({ createCanvasFromPreset }),
    );

    await expect(refresh(input)).resolves.toBe("canvas-a");

    expect(createCanvasFromPreset).not.toHaveBeenCalled();
    expect(input.setStatus).toHaveBeenLastCalledWith("ready");
    expect(input.setError).toHaveBeenLastCalledWith(null);
  });

  it("surfaces a blocked required flush as a sync error", async () => {
    const input = args({ flush: vi.fn(async () => false) });
    const refresh = createCanvasPresetRefresher(dependencies());

    await expect(refresh(input)).rejects.toThrow(
      "当前画布还有未保存冲突，处理后再同步主线视图",
    );

    expect(input.setStatus).toHaveBeenLastCalledWith("error");
    expect(input.setError).toHaveBeenLastCalledWith(
      "当前画布还有未保存冲突，处理后再同步主线视图",
    );
  });

  it.each([409, 503])(
    "silently absorbs a best-effort preset response with status %s",
    async (status) => {
      const createCanvasFromPreset = vi.fn(async () => {
        throw { status, body: {} };
      });
      const input = args({ bestEffort: true });
      const refresh = createCanvasPresetRefresher(
        dependencies({ createCanvasFromPreset }),
      );

      await expect(refresh(input)).resolves.toBe("canvas-a");

      expect(input.setStatus).toHaveBeenLastCalledWith("ready");
      expect(input.setError).toHaveBeenLastCalledWith(null);
      expect(input.reload).not.toHaveBeenCalled();
    },
  );

  it("maps a required refresh conflict to the existing user message", async () => {
    const createCanvasFromPreset = vi.fn(async () => {
      throw { status: 409, body: {} };
    });
    const input = args();
    const refresh = createCanvasPresetRefresher(
      dependencies({ createCanvasFromPreset }),
    );

    await expect(refresh(input)).rejects.toThrow(
      "主线视图已被其他窗口更新,请刷新后重试",
    );

    expect(input.setStatus).toHaveBeenLastCalledWith("error");
    expect(input.setError).toHaveBeenLastCalledWith(
      "主线视图已被其他窗口更新,请刷新后重试",
    );
  });
});
