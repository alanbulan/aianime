import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { CanvasNode } from "../domain/canvasNodeData";
import { createUseVideoNodeController, type VideoNodeStore } from "./useVideoNodeController";

vi.mock("@xyflow/react", () => ({ useUpdateNodeInternals: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("./useNodeGenerationHistory", () => ({
  useNodeGenerationHistory: () => ({ records: [], isLoading: false, refresh: vi.fn() }),
}));
vi.mock("./useNodeGenerationTaskState", () => ({
  useNodeGenerationTaskState: () => ({ isGenerating: false, progress: null }),
}));

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(source: string | null = null) {
  let data = { videoUrl: source, aspectRatio: "16:9" } as Parameters<ReturnType<typeof createUseVideoNodeController>>[0]["data"];
  let nodeExists = true;
  let requestNumber = 0;
  const readNode = (): CanvasNode | undefined => nodeExists
    ? { id: "video-1", type: "videoNode", position: { x: 0, y: 0 }, data }
    : undefined;
  const store: VideoNodeStore = {
    setSelectedNode: vi.fn(), updateNodeData: vi.fn((_id, patch) => { data = { ...data, ...patch }; }),
    addDerivedUploadNode: vi.fn(), addNode: vi.fn(), addEdge: vi.fn(), deleteEdge: vi.fn(),
    setActiveOverlayNodeId: vi.fn(), hoveredNodeId: null, findNodePosition: vi.fn(),
    autoGroupSpawn: vi.fn(), onNodesChange: vi.fn(), edges: [],
  };
  const upload = vi.fn();
  const compose = vi.fn();
  const prepare = vi.fn(async (file: File) => ({ file, transcoded: false }));
  const useController = createUseVideoNodeController({
    useStore: (selector) => selector(store), readGraph: () => ({ nodes: [], edges: [] }),
    readNode, readActiveOverlayNodeId: () => null,
    useIsBoxSelecting: () => false, useUpstreamNodes: () => [],
    useCanvasVideoModels: vi.fn().mockReturnValue({ models: [], isLoading: false }),
    useCanvasVideoCameraTemplates: vi.fn().mockReturnValue({ templates: [], isLoading: false }),
    uploadCanvasAsset: upload, ensureWebSafeVideo: prepare, translateCanvasText: vi.fn(),
    newUploadRequestId: () => `upload-${++requestNumber}`,
    submitVideoGeneration: vi.fn(), completeVideoGenerationTask: vi.fn(), composeVideoClip: compose,
    eraseVideoSubtitles: vi.fn(), validateVideoReferenceDuration: vi.fn(),
    captureVideoFrameBlob: vi.fn(), captureVideoFrameStrip: vi.fn(),
    resolveDroppedVideoFile: (transfer) => transfer.files[0] ?? null,
    showErrorDialog: vi.fn(), canvasEventBus: { subscribe: vi.fn(() => () => {}) },
    rememberLastVideoModel: vi.fn(),
  });
  const mount = () => renderHook(() => useController({ id: "video-1", data, projectId: "project-1", canvasId: "canvas-1" }));
  let view = mount();
  function drop(name: string) {
    return view.result.current.handleDrop({
      preventDefault() {}, stopPropagation() {},
      dataTransfer: { files: [new File([name], name, { type: "video/mp4" })] },
    } as unknown as Parameters<typeof view.result.current.handleDrop>[0]);
  }
  return {
    get result() { return view.result; },
    unmount: () => view.unmount(),
    remount: () => { view = mount(); },
    deleteNode: () => { nodeExists = false; view.unmount(); },
    drop, upload, prepare, compose, store, data: () => data,
  };
}

beforeEach(() => {
  vi.spyOn(URL, "createObjectURL").mockImplementation((file) => `blob:${(file as File).name}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(toast.error).mockClear();
});
afterEach(() => vi.restoreAllMocks());

it.each(["success", "failure"])("keeps the latest upload when the old request finishes with %s", async (outcome) => {
  const h = harness();
  const old = pending<{ filename: string; url: string }>();
  const latest = pending<{ filename: string; url: string }>();
  h.upload.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
  let first!: Promise<void>;
  let second!: Promise<void>;
  await act(async () => { first = h.drop("A.mp4"); });
  await act(async () => { second = h.drop("B.mp4"); });
  await act(async () => { latest.resolve({ filename: "B.mp4", url: "/B.mp4" }); await second; });
  await act(async () => {
    if (outcome === "success") old.resolve({ filename: "A.mp4", url: "/A.mp4" });
    else old.reject(new Error("旧上传失败"));
    await first;
  });
  expect(h.data()).toMatchObject({ videoUrl: "/B.mp4", sourceFileName: "B.mp4", isUploading: false, uploadError: null });
  expect(toast.error).not.toHaveBeenCalled();
});

it("projects the active upload error and clears it on a successful retry", async () => {
  const h = harness();
  h.upload.mockRejectedValueOnce(new Error("连接中断"));
  await act(async () => { await h.drop("A.mp4"); });
  expect(h.data()).toMatchObject({ isUploading: false, uploadError: "连接中断" });
  expect(toast.error).toHaveBeenCalledWith("视频上传失败：连接中断");
  h.upload.mockResolvedValueOnce({ filename: "B.mp4", url: "/B.mp4" });
  await act(async () => { await h.drop("B.mp4"); });
  expect(h.data()).toMatchObject({ videoUrl: "/B.mp4", uploadError: null });
});

it("does not commit an upload result after the node is deleted", async () => {
  const h = harness();
  const request = pending<{ filename: string; url: string }>();
  h.upload.mockReturnValueOnce(request.promise);
  let completion!: Promise<void>;
  await act(async () => { completion = h.drop("A.mp4"); });
  h.deleteNode();
  vi.mocked(h.store.updateNodeData).mockClear();
  request.resolve({ filename: "A.mp4", url: "/A.mp4" });
  await completion;
  expect(h.data().videoUrl).toBeNull();
  expect(h.store.updateNodeData).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:A.mp4");
});

it("finishes transcoding and uploading while viewport culling unmounts the node", async () => {
  const h = harness();
  const prepared = pending<{ file: File; transcoded: boolean }>();
  const request = pending<{ filename: string; url: string }>();
  h.prepare.mockReturnValueOnce(prepared.promise);
  h.upload.mockReturnValueOnce(request.promise);
  let completion!: Promise<void>;
  await act(async () => { completion = h.drop("A.mp4"); });
  h.unmount();
  const converted = new File(["converted"], "converted.mp4", { type: "video/mp4" });
  await act(async () => { prepared.resolve({ file: converted, transcoded: true }); });
  expect(h.upload).toHaveBeenCalledWith("project-1", converted, "converted.mp4", { disableTimeout: true });
  expect(URL.createObjectURL).not.toHaveBeenCalledWith(converted);
  await act(async () => { request.resolve({ filename: "A.mp4", url: "/A.mp4" }); await completion; });
  expect(h.data()).toMatchObject({ videoUrl: "/A.mp4", isUploading: false, uploadRequestId: null });
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:A.mp4");
  h.remount();
  expect(h.result.current.videoSource).toBe("/A.mp4");
  expect(h.result.current.isUploading).toBe(false);
});

it("keeps a new upload after the node leaves and reenters the viewport", async () => {
  const h = harness();
  const old = pending<{ filename: string; url: string }>();
  const latest = pending<{ filename: string; url: string }>();
  h.upload.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
  let first!: Promise<void>;
  let second!: Promise<void>;
  await act(async () => { first = h.drop("A.mp4"); });
  h.unmount();
  h.remount();
  await act(async () => { second = h.drop("B.mp4"); });
  await act(async () => { old.resolve({ filename: "A.mp4", url: "/A.mp4" }); await first; });
  expect(h.data()).toMatchObject({ videoUrl: null, sourceFileName: "B.mp4", isUploading: true });
  expect(URL.revokeObjectURL).not.toHaveBeenCalledWith("blob:B.mp4");
  await act(async () => { latest.resolve({ filename: "B.mp4", url: "/B.mp4" }); await second; });
  expect(h.data()).toMatchObject({ videoUrl: "/B.mp4", isUploading: false, uploadRequestId: null });
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:B.mp4");
});

it("does not upload an obsolete transcoding result", async () => {
  const h = harness();
  const prepared = pending<{ file: File; transcoded: boolean }>();
  h.prepare.mockReturnValueOnce(prepared.promise);
  h.upload.mockResolvedValueOnce({ filename: "B.mp4", url: "/B.mp4" });
  let first!: Promise<void>;
  await act(async () => { first = h.drop("A.mp4"); });
  await act(async () => { await h.drop("B.mp4"); });
  await act(async () => {
    prepared.resolve({ file: new File(["old"], "converted.mp4", { type: "video/mp4" }), transcoded: true });
    await first;
  });
  expect(h.upload).toHaveBeenCalledOnce();
  expect(h.data()).toMatchObject({ videoUrl: "/B.mp4", sourceFileName: "B.mp4", isUploading: false });
});

it("submits clip options and connects the resulting video to the source node", async () => {
  const h = harness("/source.mp4");
  vi.mocked(h.store.addNode).mockReturnValue("result-node");
  vi.mocked(h.store.findNodePosition).mockReturnValue({ x: 400, y: 0 });
  h.compose.mockResolvedValue({ url: "/muted-loop.mp4", durationMs: 4_000 });
  await act(async () => {
    await h.result.current.handleClipSubmit(500, 2_500, { muted: true, repeatCount: 2 });
  });
  expect(h.compose).toHaveBeenCalledWith(expect.objectContaining({
    projectId: "project-1", sourceUrl: "/source.mp4", muted: true, repeatCount: 2,
  }));
  expect(h.store.addNode).toHaveBeenCalledWith(expect.any(String), { x: 400, y: 0 }, {
    videoUrl: "/muted-loop.mp4", durationMs: 4_000, displayName: "剪辑",
  });
  expect(h.store.addEdge).toHaveBeenCalledWith("video-1", "result-node");
  expect(h.data().isClipMode).toBe(false);
});
