// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VideoNodeData } from "@/features/canvas/domain/canvasNodes";

import { useVideoNodeToolbarController } from "./useVideoNodeToolbarController";

const mocks = vi.hoisted(() => ({
  addNode: vi.fn(),
  addEdge: vi.fn(),
  findNodePosition: vi.fn(),
  onNodesChange: vi.fn(),
  setSelectedNode: vi.fn(),
  updateNodeData: vi.fn(),
  analyze: vi.fn(),
  separate: vi.fn(),
  download: vi.fn(),
  publish: vi.fn(),
  resolveUrl: vi.fn(),
  t: vi.fn((key: string) => key),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mocks.t }),
}));

vi.mock("@/features/canvas/canvasStore", () => ({
  useCanvasStore: (
    selector: (state: Record<string, unknown>) => unknown,
  ) =>
    selector({
      addNode: mocks.addNode,
      addEdge: mocks.addEdge,
      findNodePosition: mocks.findNodePosition,
      onNodesChange: mocks.onNodesChange,
      setSelectedNode: mocks.setSelectedNode,
      updateNodeData: mocks.updateNodeData,
    }),
}));

vi.mock("@/features/canvas/composition", () => ({
  analyzeCanvasVideoStory: (...args: unknown[]) => mocks.analyze(...args),
}));

vi.mock("@/modules/creative_canvas/public", () => ({
  separateCanvasAudioVideo: (...args: unknown[]) => mocks.separate(...args),
}));

vi.mock("@/features/canvas/application/canvasServices", () => ({
  canvasEventBus: { publish: (...args: unknown[]) => mocks.publish(...args) },
}));

vi.mock("@/features/canvas/application/imageData", () => ({
  resolveImageDisplayUrl: (...args: unknown[]) => mocks.resolveUrl(...args),
}));

vi.mock("@/lib/browserDownload", () => ({
  downloadUrlAsFile: (...args: unknown[]) => mocks.download(...args),
}));

function data(patch: Partial<VideoNodeData> = {}): VideoNodeData {
  return {
    videoUrl: "/source.mp4",
    aspectRatio: "16:9",
    ...patch,
  };
}

describe("useVideoNodeToolbarController", () => {
  beforeEach(() => {
    for (const mock of [
      mocks.addNode,
      mocks.addEdge,
      mocks.findNodePosition,
      mocks.onNodesChange,
      mocks.setSelectedNode,
      mocks.updateNodeData,
      mocks.analyze,
      mocks.separate,
      mocks.download,
      mocks.publish,
      mocks.resolveUrl,
      mocks.t,
    ]) {
      mock.mockReset();
    }
    mocks.addNode.mockReturnValue("derived-a");
    mocks.findNodePosition.mockImplementation(
      (_nodeId: string, x: number, y: number) => ({ x, y }),
    );
    mocks.resolveUrl.mockImplementation((url: string) => `resolved:${url}`);
    mocks.t.mockImplementation((key: string) => key);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("projects state and routes local video actions through one controller", async () => {
    const { result } = renderHook(() =>
      useVideoNodeToolbarController({
        projectId: "project-a",
        nodeId: "video-a",
        data: data({ displayName: "Preview", isClipMode: false }),
      }),
    );

    expect(result.current).toMatchObject({
      hasVideo: true,
      isAnalyzing: false,
      isSeparatingAudioVideo: false,
    });
    act(() => result.current.toggleClipMode());
    act(() => result.current.openSubtitleRemoval("box"));
    act(() => result.current.createUpscaleNode());
    act(() => result.current.openFullscreen());
    await act(async () => result.current.download());

    expect(mocks.updateNodeData).toHaveBeenNthCalledWith(1, "video-a", {
      isClipMode: true,
    });
    expect(mocks.updateNodeData).toHaveBeenNthCalledWith(2, "video-a", {
      subtitleEraseMode: "box",
      subtitleEraseBox: null,
      isClipMode: false,
    });
    expect(mocks.addNode).toHaveBeenCalledWith(
      "videoNode",
      { x: 580, y: 380 },
      expect.objectContaining({
        displayName: "node.videoUpscale.nodeTitle（1080P）",
        upscaleSourceUrl: "/source.mp4",
        isUpscaleNode: true,
      }),
    );
    expect(mocks.addEdge).toHaveBeenCalledWith("video-a", "derived-a");
    expect(mocks.onNodesChange).toHaveBeenCalledWith([
      { id: "video-a", type: "select", selected: false },
      { id: "derived-a", type: "select", selected: true },
    ]);
    expect(mocks.publish).toHaveBeenCalledWith("video-viewer/open", {
      videoUrl: "/source.mp4",
      title: "Preview",
    });
    expect(mocks.download).toHaveBeenCalledWith(
      "resolved:/source.mp4",
      "Preview.mp4",
    );
  });

  it("creates the loading story node before applying analysis results", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.addNode.mockReturnValue("story-a");
    mocks.analyze.mockResolvedValue({
      rawResult: { source: "provider" },
      rows: [{ shotNumber: 1, visualDescription: "Opening" }],
    });
    const { result } = renderHook(() =>
      useVideoNodeToolbarController({
        projectId: "project-a",
        nodeId: "video-a",
        data: data({ durationMs: 9000 }),
      }),
    );

    await act(async () => result.current.analyze());

    expect(mocks.addNode).toHaveBeenCalledWith(
      "videoStoryNode",
      { x: 720, y: 360 },
      {
        sourceVideoUrl: "/source.mp4",
        rows: [],
        rawResult: null,
        isAnalyzing: true,
        analysisStartedAt: 1234,
        analysisError: null,
      },
    );
    expect(mocks.addEdge).toHaveBeenCalledWith("video-a", "story-a");
    expect(mocks.analyze).toHaveBeenCalledWith({
      projectId: "project-a",
      videoUrl: "/source.mp4",
      durationMs: 9000,
    });
    expect(mocks.updateNodeData.mock.calls).toEqual([
      ["video-a", { isAnalyzing: true, analysisError: null }],
      [
        "story-a",
        {
          rows: [{ shotNumber: 1, visualDescription: "Opening" }],
          rawResult: { source: "provider" },
          isAnalyzing: false,
          analysisError: null,
        },
      ],
      ["video-a", { isAnalyzing: false, analysisError: null }],
    ]);
  });

  it("writes analysis failures to both the story node and source node", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.addNode.mockReturnValue("story-a");
    mocks.analyze.mockRejectedValue(new Error("analysis failed"));
    const { result } = renderHook(() =>
      useVideoNodeToolbarController({
        projectId: "project-a",
        nodeId: "video-a",
        data: data(),
      }),
    );

    await act(async () => result.current.analyze());

    expect(mocks.updateNodeData).toHaveBeenNthCalledWith(2, "story-a", {
      isAnalyzing: false,
      analysisError: "analysis failed",
    });
    expect(mocks.updateNodeData).toHaveBeenNthCalledWith(3, "video-a", {
      isAnalyzing: false,
      analysisError: "analysis failed",
    });
  });

  it("creates audio and silent-video nodes from a separation result", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.addNode
      .mockReturnValueOnce("audio-a")
      .mockReturnValueOnce("silent-a");
    mocks.separate.mockResolvedValue({
      audioUrl: "/audio.m4a",
      silentVideoUrl: "/silent.mp4",
      resultFallbackError: null,
    });
    const { result } = renderHook(() =>
      useVideoNodeToolbarController({
        projectId: "project-a",
        nodeId: "video-a",
        data: data({ sourceFileName: "episode.mp4" }),
      }),
    );

    await act(async () => result.current.separateAudioVideo());

    expect(mocks.separate).toHaveBeenCalledWith({
      projectId: "project-a",
      sourceUrl: "/source.mp4",
    });
    expect(mocks.addNode.mock.calls).toEqual([
      [
        "audioNode",
        { x: 480, y: 180 },
        {
          audioUrl: "/audio.m4a",
          sourceFileName: "episode_背景音",
          displayName: "episode_背景音",
        },
      ],
      [
        "videoNode",
        { x: 480, y: 270 },
        {
          videoUrl: "/silent.mp4",
          sourceFileName: "episode_无声.mp4",
          displayName: "episode_无声",
        },
      ],
    ]);
    expect(mocks.addEdge.mock.calls).toEqual([
      ["video-a", "audio-a"],
      ["video-a", "silent-a"],
    ]);
    expect(mocks.updateNodeData.mock.calls).toEqual([
      ["video-a", { isSeparatingAv: true }],
      ["video-a", { isSeparatingAv: false }],
    ]);
  });
});
