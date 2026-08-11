// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  personalCanvasIdForUsername,
} from "./domain/canvasIdentity";
import type { FreezoneCanvasSummary } from "./domain/canvasStorage";
import { userCreatedCanvasId } from "./presentation/canvasBrowserViewModel";
import { useCanvasBrowserController } from "./canvasBrowserComposition";

const mocks = vi.hoisted(() => ({
  listCanvases: vi.fn(),
  createCanvas: vi.fn(),
  deleteCanvas: vi.fn(),
  writeUrl: vi.fn(),
}));

vi.mock("./canvasStorageComposition", async () => {
  const { createFreezoneCanvasQueryHooks } = await import(
    "./presentation/canvasStorageQueryHooks"
  );
  return {
    createBlankFreezoneCanvas: (...args: unknown[]) =>
      mocks.createCanvas(...args),
    deleteFreezoneCanvas: (...args: unknown[]) => mocks.deleteCanvas(...args),
    ...createFreezoneCanvasQueryHooks({
      listCanvases: (params) => mocks.listCanvases(params),
    }),
  };
});

vi.mock("@/lib/url-params", () => ({
  writeUrl: (...args: unknown[]) => mocks.writeUrl(...args),
}));

vi.mock("@/modules/identity_access/public", () => ({
  useAuthStore: <T,>(selector: (state: { username: string }) => T): T =>
    selector({ username: "alice" }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function canvas(
  id: string,
  canvas_scope = "asset",
): FreezoneCanvasSummary {
  return {
    id,
    canvas_scope,
    modified_at: "2026-06-03T00:00:00Z",
    size: 1,
  };
}

describe("canvas browser controller", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.listCanvases.mockReset().mockResolvedValue([]);
    mocks.createCanvas.mockReset().mockResolvedValue(undefined);
    mocks.deleteCanvas.mockReset().mockResolvedValue(undefined);
    mocks.writeUrl.mockReset();
  });

  it("refetches the canvas catalog when the reload token changes", async () => {
    const { rerender } = renderHook(
      ({ reloadToken }) =>
        useCanvasBrowserController({
          project: "demo",
          currentCanvasId: "default",
          reloadToken,
        }),
      { initialProps: { reloadToken: 0 }, wrapper: makeWrapper() },
    );

    await waitFor(() => expect(mocks.listCanvases).toHaveBeenCalledTimes(1));

    rerender({ reloadToken: 1 });

    await waitFor(() => expect(mocks.listCanvases).toHaveBeenCalledTimes(2));
  });

  it("creates a named canvas, refreshes the catalog, and switches to it", async () => {
    const { result } = renderHook(
      () =>
        useCanvasBrowserController({
          project: "demo",
          currentCanvasId: "default",
        }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(mocks.listCanvases).toHaveBeenCalledTimes(1));

    act(() => result.current.setNewCanvasName(" 故事实验 "));
    await act(async () => {
      await result.current.createCanvas();
    });

    const canvasId = userCreatedCanvasId("故事实验", "alice");
    expect(mocks.createCanvas).toHaveBeenCalledWith("demo", {
      canvasId,
      name: "故事实验",
      creatorUsername: "alice",
    });
    expect(mocks.listCanvases).toHaveBeenCalledTimes(2);
    expect(mocks.writeUrl).toHaveBeenCalledWith({ canvas: canvasId });
    expect(result.current.newCanvasName).toBe("");
    expect(result.current.creatingCanvas).toBe(false);
  });

  it("deletes the current non-personal canvas and switches to my canvas", async () => {
    const current = canvas("asset_1");
    mocks.listCanvases.mockResolvedValue([current]);
    const { result } = renderHook(
      () =>
        useCanvasBrowserController({
          project: "demo",
          currentCanvasId: current.id,
        }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() =>
      expect(result.current.sections.otherCanvases).toContainEqual(current),
    );

    await act(async () => {
      await result.current.deleteCanvas(current);
    });

    expect(mocks.deleteCanvas).toHaveBeenCalledWith("demo", current.id);
    expect(mocks.listCanvases).toHaveBeenCalledTimes(2);
    expect(mocks.writeUrl).toHaveBeenCalledWith({
      canvas: personalCanvasIdForUsername("alice"),
    });
    expect(result.current.sections.otherCanvases).not.toContainEqual(current);
    expect(result.current.deletingCanvasId).toBeNull();
  });

  it("restores the current mainline canvas after presentation confirmation", async () => {
    const onRestoreMainlineDefault = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () =>
        useCanvasBrowserController({
          project: "demo",
          currentCanvasId: "ep1_beat1",
          onRestoreMainlineDefault,
        }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.restoreMainline();
    });

    expect(onRestoreMainlineDefault).toHaveBeenCalledTimes(1);
    expect(result.current.restoringMainline).toBe(false);
  });
});
