// Copyright (c) 2026 AI anime
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CANVAS_NODE_TYPES,
  EXPORT_RESULT_NODE_DEFAULT_WIDTH,
  EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
  type CanvasNodeData,
} from "@/features/canvas/domain/canvasNodes";

import { useImageMatteController } from "./useImageMatteController";

const mocks = vi.hoisted(() => ({
  addNode: vi.fn(() => "matte-node"),
  addEdge: vi.fn(),
  findNodePosition: vi.fn(() => ({ x: 480, y: 20 })),
  setSelectedNode: vi.fn(),
  updateNodeData: vi.fn(),
  uploadCanvasAsset: vi.fn(),
  matteInWorker: vi.fn(),
  preloadMatteWorker: vi.fn(),
  readUrl: vi.fn(
    (): { project: string | null } => ({ project: "project-a" }),
  ),
}));

vi.mock("@/features/canvas/canvasStore", () => ({
  useCanvasStore: (
    selector: (state: Record<string, unknown>) => unknown,
  ) =>
    selector({
      addNode: mocks.addNode,
      addEdge: mocks.addEdge,
      findNodePosition: mocks.findNodePosition,
      setSelectedNode: mocks.setSelectedNode,
      updateNodeData: mocks.updateNodeData,
    }),
}));

vi.mock("@/features/canvas/composition", () => ({
  uploadCanvasAsset: mocks.uploadCanvasAsset,
}));

vi.mock("@/features/canvas/infrastructure/matteClient", () => ({
  matteInWorker: mocks.matteInWorker,
  preloadMatteWorker: mocks.preloadMatteWorker,
}));

vi.mock("@/lib/url-params", () => ({
  readUrl: mocks.readUrl,
}));

function options() {
  return {
    nodeId: "image-a",
    nodeData: {
      imageUrl: "/source.png",
      aspectRatio: "4:3",
      projection_key: "projection-a",
    } as CanvasNodeData,
    imageSource: "/source.png",
    displayName: "抠图",
  };
}

describe("useImageMatteController", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.addNode.mockReturnValue("matte-node");
    mocks.findNodePosition.mockReturnValue({ x: 480, y: 20 });
    mocks.readUrl.mockReturnValue({ project: "project-a" });
    vi.spyOn(Date, "now").mockReturnValue(1234);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (window as unknown as { requestIdleCallback?: unknown })
      .requestIdleCallback;
    delete (window as unknown as { cancelIdleCallback?: unknown })
      .cancelIdleCallback;
  });

  it("preloads the worker during idle time and cancels the idle request", () => {
    const cancelIdleCallback = vi.fn();
    Object.assign(window, {
      requestIdleCallback: (callback: () => void) => {
        callback();
        return 17;
      },
      cancelIdleCallback,
    });

    const { unmount } = renderHook(() => useImageMatteController(options()));

    expect(mocks.preloadMatteWorker).toHaveBeenCalledOnce();
    unmount();
    expect(cancelIdleCallback).toHaveBeenCalledWith(17);
  });

  it("creates a loading child and writes back the uploaded matte result", async () => {
    const sourceBlob = new Blob(["source"]);
    const matteBlob = new Blob(["matte"]);
    const fetchSource = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: vi.fn().mockResolvedValue(sourceBlob),
    });
    vi.stubGlobal("fetch", fetchSource);
    mocks.matteInWorker.mockResolvedValue(matteBlob);
    mocks.uploadCanvasAsset.mockResolvedValue({ url: "/matte.png" });
    const { result } = renderHook(() => useImageMatteController(options()));

    act(() => result.current.matte());

    expect(mocks.findNodePosition).toHaveBeenCalledWith(
      "image-a",
      EXPORT_RESULT_NODE_DEFAULT_WIDTH,
      EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
    );
    expect(mocks.addNode).toHaveBeenCalledWith(
      CANVAS_NODE_TYPES.exportImage,
      { x: 480, y: 20 },
      expect.objectContaining({
        displayName: "抠图",
        imageUrl: null,
        aspectRatio: "4:3",
        resultKind: "matte",
        isGenerating: true,
        generationStartedAt: 1234,
        user_spawned: true,
        source_projection_key: "projection-a",
      }),
    );
    expect(mocks.addEdge).toHaveBeenCalledWith("image-a", "matte-node");
    expect(mocks.setSelectedNode).toHaveBeenCalledWith("matte-node");
    await waitFor(() =>
      expect(mocks.updateNodeData).toHaveBeenCalledWith("matte-node", {
        imageUrl: "/matte.png",
        previewImageUrl: "/matte.png",
        isGenerating: false,
        generationStartedAt: null,
        generationError: null,
        generationErrorDetails: null,
      }),
    );
    expect(fetchSource).toHaveBeenCalledWith("/source.png");
    expect(mocks.matteInWorker).toHaveBeenCalledWith(sourceBlob);
    expect(mocks.uploadCanvasAsset).toHaveBeenCalledWith(
      "project-a",
      matteBlob,
      "matte-image-a-1234.png",
    );
  });

  it("writes the fetch failure to the loading child", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    const { result } = renderHook(() => useImageMatteController(options()));

    act(() => result.current.matte());

    await waitFor(() =>
      expect(mocks.updateNodeData).toHaveBeenCalledWith("matte-node", {
        isGenerating: false,
        generationStartedAt: null,
        generationError: "fetch source failed: 503",
        generationErrorDetails: "fetch source failed: 503",
      }),
    );
    expect(mocks.uploadCanvasAsset).not.toHaveBeenCalled();
  });

  it("does not create a node when the project id is unavailable", () => {
    mocks.readUrl.mockReturnValue({ project: null });
    const { result } = renderHook(() => useImageMatteController(options()));

    act(() => result.current.matte());

    expect(mocks.addNode).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      "[matte] no project_id in URL (?p=<project_id>) — cannot persist matted PNG",
    );
  });
});
