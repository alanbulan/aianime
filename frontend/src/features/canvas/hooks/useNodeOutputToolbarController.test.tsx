// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

;

import { useNodeOutputToolbarController } from "./useNodeOutputToolbarController";

import { CANVAS_NODE_TYPES, type CanvasNode, type CanvasNodeType } from "@/modules/creative_canvas/public";
const mocks = vi.hoisted(() => ({
  downloadUrl: vi.fn(),
  resolveUrl: vi.fn((url: string) => `resolved:${url}`),
  t: vi.fn(
    (key: string, options?: { index?: string; content?: string }) =>
      key === "nodeToolbar.storyboardLine"
        ? `${options?.index}: ${options?.content}`
        : key,
  ),
  writeText: vi.fn(),
  settings: { ignoreAtTagWhenCopyingAndGenerating: true },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: mocks.t,
    i18n: { language: "zh-CN" },
  }),
}));

vi.mock("@/modules/creative_canvas/public", () => ({
  CANVAS_NODE_TYPES: { upload: 'uploadNode', imageEdit: 'imageNode', imageGen: 'imageGenNode', exportImage: 'exportImageNode', beatContext: 'beatContextNode', textAnnotation: 'textAnnotationNode', group: 'groupNode', storyboardSplit: 'storyboardNode', storyboardGen: 'storyboardGenNode', video: 'videoNode', audio: 'audioNode', videoStory: 'videoStoryNode', videoCompose: 'videoComposeNode', script: 'scriptNode', pano360Viewer: 'pano360ViewerNode', threeDWorld: 'threeDWorldNode', skill: 'skillNode' },
  buildGenerationErrorReport: ({
    errorMessage,
    errorDetails,
  }: {
    errorMessage: string;
    errorDetails?: string;
  }) => [errorMessage, errorDetails].filter(Boolean).join("\n"),
  projectNodeActionGenerationError: (
    node: { data?: Record<string, unknown> },
    fallbackErrorMessage: string,
  ) => {
    const data = node.data ?? {};
    const generationError =
      typeof data.generationError === "string"
        ? data.generationError.trim()
        : "";
    const generationErrorDetails =
      typeof data.generationErrorDetails === "string"
        ? data.generationErrorDetails.trim()
        : "";
    return {
      canCopy: Boolean(generationError),
      report: generationErrorDetails || generationError || fallbackErrorMessage,
    };
  },
  projectNodeActionStoryboardText: (
    node: {
      type?: string | null;
      data?: { frames?: Array<{ description?: string; note?: string; order?: number }> };
    },
    ignoreAtTag: boolean,
    formatLine: (index: string, content: string) => string,
  ) => {
    const frames = node.data?.frames ?? [];
    const sanitize = (input: string) =>
      ignoreAtTag ? input.replace(/@\S+/g, "").trim() : input;
    if (node.type === "storyboardSplitNode") {
      return {
        canCopy: true,
        text: [...frames]
          .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
          .map((frame, index) =>
            formatLine(
              String(index + 1).padStart(2, "0"),
              sanitize(frame.note ?? ""),
            ),
          )
          .join("\n"),
      };
    }
    if (node.type === "storyboardGenNode") {
      return {
        canCopy: true,
        text: frames
          .map((frame, index) =>
            formatLine(
              String(index + 1).padStart(2, "0"),
              sanitize(frame.description ?? ""),
            ),
          )
          .join("\n"),
      };
    }
    return { canCopy: false, text: "" };
  },
  resolveImageDisplayUrl: (url: string) => mocks.resolveUrl(url),
  resolveCanvasNodeSourceImageUrl: (node: {
    data?: Record<string, unknown>;
  }) => {
    const data = node.data ?? {};
    return data.imageUrl ?? data.previewImageUrl ?? data.referenceImageUrl ?? null;
  },
  sanitizeStoryboardText: (input: string, ignoreAtTag: boolean) =>
    ignoreAtTag ? input.replace(/@\S+/g, "").trim() : input,
  resolveNodeActionImageDownloadFilename: (
    node: { id: string; data?: Record<string, unknown> },
  ) => {
    const sourceFileName =
      typeof node.data?.sourceFileName === "string"
        ? node.data.sourceFileName.trim()
        : "";
    if (sourceFileName) return sourceFileName;
    const displayName =
      typeof node.data?.displayName === "string"
        ? node.data.displayName.trim()
        : "";
    return displayName ? `${displayName}.png` : `node-${node.id}.png`;
  },
}));

vi.mock("@/lib/browserDownload", () => ({
  downloadUrlAsFile: (url: string, filename: string) =>
    mocks.downloadUrl(url, filename),
}));

vi.mock("@/stores/settingsStore", () => ({
  useSettingsStore: (
    selector: (state: typeof mocks.settings) => unknown,
  ) => selector(mocks.settings),
}));

function node(
  type: CanvasNodeType,
  data: Record<string, unknown>,
  id = "node-a",
): CanvasNode {
  return { id, type, position: { x: 0, y: 0 }, data } as CanvasNode;
}

describe("useNodeOutputToolbarController", () => {
  beforeEach(() => {
    mocks.downloadUrl.mockReset();
    mocks.resolveUrl.mockReset().mockImplementation(
      (url: string) => `resolved:${url}`,
    );
    mocks.t.mockClear();
    mocks.writeText.mockReset().mockResolvedValue(undefined);
    mocks.settings.ignoreAtTagWhenCopyingAndGenerating = true;
    vi.stubGlobal("navigator", {
      clipboard: { writeText: mocks.writeText },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("projects sanitized storyboard text and clears copy feedback", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useNodeOutputToolbarController({
        node: node(CANVAS_NODE_TYPES.storyboardGen, {
          frames: [
            { description: "First @图1", referenceIndex: null },
            { description: "Second", referenceIndex: null },
          ],
        }),
      }),
    );

    expect(result.current).toMatchObject({
      canCopyStoryboardText: true,
      canCopyGenerationError: false,
      canDownloadImage: false,
      isCopyTextSuccess: false,
    });

    await act(async () => result.current.copyStoryboardText());

    expect(mocks.writeText).toHaveBeenCalledWith("01: First\n02: Second");
    expect(result.current.isCopyTextSuccess).toBe(true);

    act(() => vi.advanceTimersByTime(1100));
    expect(result.current.isCopyTextSuccess).toBe(false);
  });

  it("copies the preserved ImageGen error details", async () => {
    const { result } = renderHook(() =>
      useNodeOutputToolbarController({
        node: node(CANVAS_NODE_TYPES.imageGen, {
          generationError: "Provider error",
          generationErrorDetails: "Raw provider error",
        }),
      }),
    );

    expect(result.current.canCopyGenerationError).toBe(true);
    await act(async () => result.current.copyGenerationError());
    expect(mocks.writeText).toHaveBeenCalledWith("Raw provider error");
    expect(result.current.isCopyErrorSuccess).toBe(true);
  });

  it("downloads the canonical image source with the projected filename", async () => {
    mocks.downloadUrl.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useNodeOutputToolbarController({
        node: node(
          CANVAS_NODE_TYPES.upload,
          {
            imageUrl: "/source.png",
            sourceFileName: "source.webp",
            aspectRatio: "1:1",
          },
          "image-a",
        ),
      }),
    );

    expect(result.current.canDownloadImage).toBe(true);
    await act(async () => result.current.downloadImage());
    expect(mocks.resolveUrl).toHaveBeenCalledWith("/source.png");
    expect(mocks.downloadUrl).toHaveBeenCalledWith(
      "resolved:/source.png",
      "source.webp",
    );
  });

  it("does not expose download for image-edit nodes", async () => {
    const { result } = renderHook(() =>
      useNodeOutputToolbarController({
        node: node(CANVAS_NODE_TYPES.imageEdit, {
          imageUrl: "/edited.png",
        }),
      }),
    );

    expect(result.current.canDownloadImage).toBe(false);
    await act(async () => result.current.downloadImage());
    expect(mocks.resolveUrl).not.toHaveBeenCalled();
    expect(mocks.downloadUrl).not.toHaveBeenCalled();
  });
});
