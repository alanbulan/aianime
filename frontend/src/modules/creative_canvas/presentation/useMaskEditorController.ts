// Copyright (c) 2026 AI anime
import {
  useEffect,
  useRef,
  useState,
  type PointerEventHandler,
  type RefObject,
} from "react";

import {
  DEFAULT_CANVAS_REDRAW_ASPECT_RATIO,
  DEFAULT_CANVAS_REDRAW_IMAGE_SIZE,
  type CanvasRedrawAspectRatio,
  type CanvasRedrawImageSize,
} from "../domain/redraw";

export type MaskEditorTool = "brush" | "eraser";

export const MASK_EDITOR_BRUSH_SIZES = [10, 25, 50, 100, 150] as const;
const DEFAULT_BRUSH_SIZE = 50;

export interface MaskEditorModelOption {
  apiModel: string;
  label: string;
}

export interface MaskEditorModelCatalog {
  models: readonly MaskEditorModelOption[];
  isLoading: boolean;
  error: Error | null;
}

export interface MaskEditorGenerateRequest {
  projectId: string;
  sourceUrl: string;
  maskUrl: string;
  prompt: string;
  aspectRatio: CanvasRedrawAspectRatio;
  imageSize: CanvasRedrawImageSize;
  model: string;
}

export interface MaskEditorControllerDependencies {
  useImageModels(projectId: string): MaskEditorModelCatalog;
  uploadAsset(
    projectId: string,
    file: File,
    filename: string,
  ): Promise<{ url: string }>;
  generateRedraw(
    request: MaskEditorGenerateRequest,
    onTaskSubmitted: () => void,
  ): Promise<{ url: string }>;
  createImage(): HTMLImageElement;
  createCanvas(): HTMLCanvasElement;
  createMaskFile(blob: Blob): File;
}

export interface MaskEditorControllerOptions {
  project: string;
  baseUrl: string;
  onClose(): void;
  onResult(url: string): void;
}

export interface MaskEditorController {
  baseCanvasRef: RefObject<HTMLCanvasElement | null>;
  maskCanvasRef: RefObject<HTMLCanvasElement | null>;
  tool: MaskEditorTool;
  setTool(tool: MaskEditorTool): void;
  brushSize: number;
  setBrushSize(size: number): void;
  prompt: string;
  setPrompt(prompt: string): void;
  imageReady: boolean;
  submitting: boolean;
  progressMessage: string | null;
  error: string | null;
  modelCatalogErrorMessage: string | null;
  modelCatalogLoading: boolean;
  selectedModelLabel: string | null;
  hasModel: boolean;
  canSubmit: boolean;
  canvasCursor: "crosshair" | "cell";
  onPointerDown: PointerEventHandler<HTMLCanvasElement>;
  onPointerMove: PointerEventHandler<HTMLCanvasElement>;
  onPointerUp(): void;
  clearMask(): void;
  submit(): Promise<void>;
}

function canvasPoint(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
}

function hasPaint(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext("2d");
  if (!context) return false;
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < data.length; index += 16 * 4) {
    if (data[index] > 8) return true;
  }
  return false;
}

async function buildMaskBlob(
  source: HTMLCanvasElement,
  createCanvas: () => HTMLCanvasElement,
): Promise<Blob> {
  const output = createCanvas();
  output.width = source.width;
  output.height = source.height;
  const context = output.getContext("2d");
  if (!context) throw new Error("mask output context unavailable");
  context.fillStyle = "rgba(255,255,255,1)";
  context.fillRect(0, 0, output.width, output.height);
  context.globalCompositeOperation = "destination-out";
  context.drawImage(source, 0, 0);
  return await new Promise<Blob>((resolve, reject) => {
    output.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("mask PNG encode failed"));
    }, "image/png");
  });
}

export function useMaskEditorController(
  {
    project,
    baseUrl,
    onClose,
    onResult,
  }: MaskEditorControllerOptions,
  {
    useImageModels,
    uploadAsset,
    generateRedraw,
    createImage,
    createCanvas,
    createMaskFile,
  }: MaskEditorControllerDependencies,
): MaskEditorController {
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [tool, setTool] = useState<MaskEditorTool>("brush");
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);
  const [prompt, setPrompt] = useState("");
  const [imageReady, setImageReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modelCatalog = useImageModels(project);
  const selectedModel = modelCatalog.models[0] ?? null;
  const requestModel = selectedModel?.apiModel.trim() ?? "";

  useEffect(() => {
    let active = true;
    setImageReady(false);
    setError(null);
    const image = createImage();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (!active) return;
      const baseCanvas = baseCanvasRef.current;
      const maskCanvas = maskCanvasRef.current;
      if (!baseCanvas || !maskCanvas) return;
      baseCanvas.width = image.naturalWidth;
      baseCanvas.height = image.naturalHeight;
      maskCanvas.width = image.naturalWidth;
      maskCanvas.height = image.naturalHeight;
      baseCanvas.getContext("2d")?.drawImage(image, 0, 0);
      setImageReady(true);
    };
    image.onerror = () => {
      if (active) setError("无法加载基底图（cookie 可能过期）");
    };
    image.src = baseUrl;
    return () => {
      active = false;
      image.onload = null;
      image.onerror = null;
    };
  }, [baseUrl, createImage]);

  const drawDot = (x: number, y: number) => {
    const context = maskCanvasRef.current?.getContext("2d");
    if (!context) return;
    context.lineCap = "round";
    context.lineJoin = "round";
    if (tool === "brush") {
      context.globalCompositeOperation = "source-over";
      context.fillStyle = "rgba(239, 68, 68, 0.55)";
    } else {
      context.globalCompositeOperation = "destination-out";
    }
    context.beginPath();
    context.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    context.fill();
  };

  const drawLine = (
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) => {
    const context = maskCanvasRef.current?.getContext("2d");
    if (!context) return;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = brushSize;
    if (tool === "brush") {
      context.globalCompositeOperation = "source-over";
      context.strokeStyle = "rgba(239, 68, 68, 0.55)";
    } else {
      context.globalCompositeOperation = "destination-out";
      context.strokeStyle = "rgba(0,0,0,1)";
    }
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  };

  const onPointerDown: PointerEventHandler<HTMLCanvasElement> = (event) => {
    event.preventDefault();
    if (submitting) return;
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    const point = canvasPoint(canvas, event.clientX, event.clientY);
    lastPointRef.current = point;
    drawDot(point.x, point.y);
  };

  const onPointerMove: PointerEventHandler<HTMLCanvasElement> = (event) => {
    if (!drawingRef.current) return;
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const point = canvasPoint(canvas, event.clientX, event.clientY);
    if (lastPointRef.current) drawLine(lastPointRef.current, point);
    lastPointRef.current = point;
  };

  const onPointerUp = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const clearMask = () => {
    const canvas = maskCanvasRef.current;
    canvas
      ?.getContext("2d")
      ?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const submit = async () => {
    if (!requestModel) {
      setError(modelCatalog.error?.message || "暂无可用图像模型");
      return;
    }
    if (!prompt.trim()) {
      setError("写一句 prompt 描述要把蒙版区域改成什么");
      return;
    }
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas || !hasPaint(maskCanvas)) {
      setError("先涂个区域吧（红色画笔涂哪改哪）");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      setProgressMessage("生成 mask 文件...");
      const maskBlob = await buildMaskBlob(maskCanvas, createCanvas);
      const maskFile = createMaskFile(maskBlob);
      setProgressMessage("上传 mask...");
      const uploaded = await uploadAsset(project, maskFile, maskFile.name);
      setProgressMessage("提交局部重绘...");
      const result = await generateRedraw(
        {
          projectId: project,
          sourceUrl: baseUrl,
          maskUrl: uploaded.url.split("?")[0],
          prompt,
          aspectRatio: DEFAULT_CANVAS_REDRAW_ASPECT_RATIO,
          imageSize: DEFAULT_CANVAS_REDRAW_IMAGE_SIZE,
          model: requestModel,
        },
        () => setProgressMessage("处理中（30-60s）..."),
      );
      setProgressMessage("完成");
      onResult(result.url);
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : String(submitError),
      );
      setProgressMessage(null);
    } finally {
      setSubmitting(false);
    }
  };

  return {
    baseCanvasRef,
    maskCanvasRef,
    tool,
    setTool,
    brushSize,
    setBrushSize,
    prompt,
    setPrompt,
    imageReady,
    submitting,
    progressMessage,
    error,
    modelCatalogErrorMessage: modelCatalog.error?.message ?? null,
    modelCatalogLoading: modelCatalog.isLoading,
    selectedModelLabel: selectedModel?.label ?? null,
    hasModel: Boolean(requestModel),
    canSubmit:
      !submitting &&
      imageReady &&
      !modelCatalog.isLoading &&
      Boolean(requestModel),
    canvasCursor: tool === "brush" ? "crosshair" : "cell",
    onPointerDown,
    onPointerMove,
    onPointerUp,
    clearMask,
    submit,
  };
}
