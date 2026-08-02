// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  useMaskEditorController,
  type MaskEditorControllerDependencies,
  type MaskEditorModelCatalog,
} from "./useMaskEditorController";

const image = {
  crossOrigin: "",
  src: "",
  naturalWidth: 640,
  naturalHeight: 360,
  onload: null,
  onerror: null,
} as unknown as HTMLImageElement;

const encodedMask = new Blob(["mask"], { type: "image/png" });
const maskFile = new File([encodedMask], "mask.png", {
  type: "image/png",
});
const outputContext = {
  fillStyle: "",
  globalCompositeOperation: "source-over",
  fillRect: vi.fn(),
  drawImage: vi.fn(),
} as unknown as CanvasRenderingContext2D;
const outputCanvas = {
  width: 0,
  height: 0,
  getContext: vi.fn(() => outputContext),
  toBlob: vi.fn((callback: BlobCallback) => callback(encodedMask)),
} as unknown as HTMLCanvasElement;

const catalog: MaskEditorModelCatalog = {
  models: [],
  isLoading: false,
  error: null,
};

const mocks = {
  close: vi.fn(),
  createCanvas: vi.fn(() => outputCanvas),
  createImage: vi.fn(() => image),
  createMaskFile: vi.fn(() => maskFile),
  generateRedraw: vi.fn(),
  result: vi.fn(),
  uploadAsset: vi.fn(),
  useImageModels: vi.fn(() => catalog),
};

const dependencies = {
  useImageModels: mocks.useImageModels,
  uploadAsset: mocks.uploadAsset,
  generateRedraw: mocks.generateRedraw,
  createImage: mocks.createImage,
  createCanvas: mocks.createCanvas,
  createMaskFile: mocks.createMaskFile,
} satisfies MaskEditorControllerDependencies;

function renderController() {
  return renderHook(() =>
    useMaskEditorController(
      {
        project: "project-a",
        baseUrl: "https://media.example/base.png",
        onClose: mocks.close,
        onResult: mocks.result,
      },
      dependencies,
    ),
  );
}

describe("useMaskEditorController", () => {
  beforeEach(() => {
    catalog.models = [];
    catalog.isLoading = false;
    catalog.error = null;
    image.onload = null;
    image.onerror = null;
    mocks.close.mockReset();
    mocks.createCanvas.mockClear();
    mocks.createImage.mockClear();
    mocks.createMaskFile.mockClear();
    mocks.generateRedraw.mockReset();
    mocks.result.mockReset();
    mocks.uploadAsset.mockReset();
    mocks.useImageModels.mockClear();
    outputCanvas.width = 0;
    outputCanvas.height = 0;
    vi.mocked(outputContext.fillRect).mockClear();
    vi.mocked(outputContext.drawImage).mockClear();
  });

  it("loads the base image into both canvases", () => {
    const baseContext = { drawImage: vi.fn() };
    const baseCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => baseContext),
    } as unknown as HTMLCanvasElement;
    const maskCanvas = {
      width: 0,
      height: 0,
    } as unknown as HTMLCanvasElement;
    const { result } = renderController();

    act(() => {
      result.current.baseCanvasRef.current = baseCanvas;
      result.current.maskCanvasRef.current = maskCanvas;
      image.onload?.call(image, new Event("load"));
    });

    expect(image.crossOrigin).toBe("anonymous");
    expect(image.src).toBe("https://media.example/base.png");
    expect(baseCanvas.width).toBe(640);
    expect(baseCanvas.height).toBe(360);
    expect(maskCanvas.width).toBe(640);
    expect(maskCanvas.height).toBe(360);
    expect(baseContext.drawImage).toHaveBeenCalledWith(image, 0, 0);
    expect(result.current.imageReady).toBe(true);
  });

  it("validates the authorized model, prompt, and painted region", async () => {
    const hook = renderController();

    await act(async () => hook.result.current.submit());
    expect(hook.result.current.error).toBe("暂无可用图像模型");

    catalog.models = [{ apiModel: "image-edit-v1", label: "Image Edit" }];
    hook.rerender();
    await act(async () => hook.result.current.submit());
    expect(hook.result.current.error).toBe(
      "写一句 prompt 描述要把蒙版区域改成什么",
    );

    act(() => hook.result.current.setPrompt("移除路人"));
    await act(async () => hook.result.current.submit());
    expect(hook.result.current.error).toBe(
      "先涂个区域吧（红色画笔涂哪改哪）",
    );
    expect(mocks.uploadAsset).not.toHaveBeenCalled();
  });

  it("uploads a mask and submits one redraw request", async () => {
    catalog.models = [{ apiModel: " image-edit-v1 ", label: "Image Edit" }];
    const maskContext = {
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray([0, 0, 0, 255]),
      })),
    };
    const maskCanvas = {
      width: 1,
      height: 1,
      getContext: vi.fn(() => maskContext),
    } as unknown as HTMLCanvasElement;
    mocks.uploadAsset.mockResolvedValue({
      url: "https://media.example/mask.png?signature=temporary",
    });
    mocks.generateRedraw.mockImplementation(
      async (_request, onTaskSubmitted) => {
        onTaskSubmitted();
        return { url: "https://media.example/result.png" };
      },
    );
    const hook = renderController();

    act(() => {
      hook.result.current.maskCanvasRef.current = maskCanvas;
      hook.result.current.setPrompt("移除路人");
    });
    await act(async () => hook.result.current.submit());

    expect(mocks.createMaskFile).toHaveBeenCalledWith(encodedMask);
    expect(mocks.uploadAsset).toHaveBeenCalledWith(
      "project-a",
      maskFile,
      "mask.png",
    );
    expect(mocks.generateRedraw).toHaveBeenCalledWith(
      {
        projectId: "project-a",
        sourceUrl: "https://media.example/base.png",
        maskUrl: "https://media.example/mask.png",
        prompt: "移除路人",
        aspectRatio: "original",
        imageSize: "2K",
        model: "image-edit-v1",
      },
      expect.any(Function),
    );
    expect(mocks.result).toHaveBeenCalledWith(
      "https://media.example/result.png",
    );
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(hook.result.current.progressMessage).toBe("完成");
    expect(hook.result.current.submitting).toBe(false);
  });
});
