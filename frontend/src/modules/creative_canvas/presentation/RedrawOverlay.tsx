// Copyright (c) 2026 AI anime
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Brush,
  Eraser,
  RotateCcw,
  Square,
  Undo2,
  X,
} from 'lucide-react';

import { CANVAS_NODE_INPUT_PLACEHOLDER_CLASS } from './canvasNodeFrameStyles';
import { NODE_CREDIT_PILL_FLAT_CLASS } from './canvasNodeControlStyles';
import { ProviderModelPicker } from './ProviderModelPicker';
import { DEFAULT_ASPECT_RATIO } from '../domain/aspectRatio';
import {
  EXPORT_RESULT_NODE_DEFAULT_WIDTH,
  EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
} from '../domain/imageNodeLayout';
import {
  CANVAS_REDRAW_ASPECT_RATIOS,
  CANVAS_REDRAW_IMAGE_SIZES,
  CANVAS_REDRAW_NUM_IMAGES,
  DEFAULT_CANVAS_REDRAW_ASPECT_RATIO,
  DEFAULT_CANVAS_REDRAW_IMAGE_SIZE,
  DEFAULT_CANVAS_REDRAW_NUM_IMAGES,
  type CanvasRedrawAspectRatio,
  type CanvasRedrawImageSize,
  type CanvasRedrawNumImages,
} from '../domain/redraw';
import { CANVAS_NODE_TYPES } from '../domain/canvasConnection';
import { inheritMainlineFields } from '../domain/inheritMainlineFields';
import type { CanvasNode, CanvasNodeData } from '../domain/canvasNodeData';
import { generationTaskDescriptor } from '../application/resumeGeneration';
import type { CanvasGenerationTaskRef } from '../application/completeCanvasMediaGenerationTask';
import type {
  GenerateCanvasRedrawParams,
  GenerateCanvasRedrawResult,
} from '../application/generateCanvasRedraw';
import type { CanvasCatalogModelOption } from '../application/generationCatalog';
import { buildRedHighlightMaskBlob } from '../application/maskHighlight';
import {
  useMaskPainting,
  type MaskPaintingTool,
} from './useMaskPainting';

import { CreditCostPill } from '@/components/credit-visual';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { imageModelSupportsQuality, useGenerationCreditCost } from '@/modules/model_usage/public';

interface RedrawOverlayProps {
  projectId: string;
  node: CanvasNode;
  imageSource: string;
  onClose: () => void;
}

export interface RedrawOverlayStore {
  addNode: (
    type: string,
    position: { x: number; y: number },
    data?: Partial<CanvasNodeData>,
  ) => string;
  addEdge: (sourceId: string, targetId: string) => void;
  setSelectedNode: (id: string | null) => void;
  findNodePosition: (
    nodeId: string,
    width: number,
    height: number,
  ) => { x: number; y: number };
  updateNodeData: (id: string, patch: Partial<CanvasNodeData>) => void;
}

export type RedrawOverlayStoreHook = <TSelected>(
  selector: (state: RedrawOverlayStore) => TSelected,
) => TSelected;

export type RedrawOverlayUseImageModels = (
  projectId: string,
  purpose: 'edit',
) => { models: CanvasCatalogModelOption[] };

export type RedrawOverlayGenerateRedraw = (
  params: GenerateCanvasRedrawParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) => Promise<GenerateCanvasRedrawResult>;

export type RedrawOverlayUploadCanvasAsset = (
  projectId: string,
  file: File | Blob,
  filename: string,
) => Promise<{ filename: string; url: string }>;

// 数量 > 1 时多个结果节点纵向错开摆放的间距。
const RESULT_STACK_GAP = 24;
const BRUSH_MIN = 4;
const BRUSH_MAX = 200;
const DEFAULT_BRUSH = 40;
const REDRAW_MODAL_CLASS =
  'relative flex h-[min(700px,78vh)] w-[min(860px,86vw)] flex-col overflow-hidden rounded-[10px] border border-border bg-popover/96 shadow-2xl backdrop-blur-md';
const REDRAW_TEXT_BUTTON_CLASS =
  'inline-flex items-center gap-1 rounded px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30';
const REDRAW_PROMPT_CLASS =
  'h-[72px] w-full resize-none rounded-[8px] border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/45';
const BRUSH_SLIDER_CLASS =
  'h-0.5 w-24 cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-none [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary';
const REDRAW_CONFIRM_BUTTON_CLASS =
  'inline-flex h-8 items-center justify-center rounded-[8px] bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground/40';

export function createRedrawOverlay({
  useStore,
  useCanvasImageModels,
  generateCanvasRedraw,
  uploadCanvasAsset,
}: {
  useStore: RedrawOverlayStoreHook;
  useCanvasImageModels: RedrawOverlayUseImageModels;
  generateCanvasRedraw: RedrawOverlayGenerateRedraw;
  uploadCanvasAsset: RedrawOverlayUploadCanvasAsset;
}) {
  return memo(({
    projectId,
    node,
    imageSource,
    onClose,
  }: RedrawOverlayProps) => {
    const { t } = useTranslation();
    const addNode = useStore((state) => state.addNode);
    const addEdge = useStore((state) => state.addEdge);
    const setSelectedNode = useStore((state) => state.setSelectedNode);
    const findNodePosition = useStore((state) => state.findNodePosition);
    const updateNodeData = useStore((state) => state.updateNodeData);

    const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const undoStackRef = useRef<ImageData[]>([]);
    const baseUrlRef = useRef(imageSource.split('?')[0]);

    const [tool, setTool] = useState<MaskPaintingTool>('brush');
    const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH);
    const [imageReady, setImageReady] = useState(false);
    const [hasMask, setHasMask] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [prompt, setPrompt] = useState('');
    const [modelId, setModelId] = useState<string>('');
    const { models: availableModels } = useCanvasImageModels(projectId, 'edit');
    const [imageSize, setImageSize] = useState<CanvasRedrawImageSize>(
      DEFAULT_CANVAS_REDRAW_IMAGE_SIZE,
    );
    const [numImages, setNumImages] = useState<CanvasRedrawNumImages>(
      DEFAULT_CANVAS_REDRAW_NUM_IMAGES,
    );
    const [aspectRatio, setAspectRatio] = useState<CanvasRedrawAspectRatio>(
      DEFAULT_CANVAS_REDRAW_ASPECT_RATIO,
    );
    const selectedModel =
      availableModels.find((m) => m.id === modelId)
      ?? availableModels[0];
    const creditCost = useGenerationCreditCost(
      'image_selection',
      selectedModel?.apiModel ?? null,
      {
        surface: 'canvas',
        params: imageModelSupportsQuality(selectedModel?.apiModel)
          ? { size: imageSize, quality: 'medium' }
          : { size: imageSize },
        quantity: Math.min(Math.max(numImages, 1), 4),
      },
    );

    // Load base image, size all canvases.
    useEffect(() => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imageSource;
      img.onload = () => {
        const baseCanvas = baseCanvasRef.current;
        const maskCanvas = maskCanvasRef.current;
        const previewCanvas = previewCanvasRef.current;
        if (!baseCanvas || !maskCanvas || !previewCanvas) return;
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        [baseCanvas, maskCanvas, previewCanvas].forEach((c) => {
          c.width = w;
          c.height = h;
        });
        baseCanvas.getContext('2d')?.drawImage(img, 0, 0);
        setImageReady(true);
      };
      img.onerror = () => setError(t('redraw.sourceLoadFailed'));
    }, [imageSource, t]);

    const pushUndoSnapshot = useCallback(() => {
      const canvas = maskCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      if (undoStackRef.current.length >= 32) {
        undoStackRef.current.shift();
      }
      undoStackRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    }, []);

    const { onPointerDown, onPointerMove, onPointerUp, recomputeHasMask } =
      useMaskPainting({
        maskCanvasRef,
        previewCanvasRef,
        tool,
        brushSize,
        enabled: !submitting && imageReady,
        beforeStroke: pushUndoSnapshot,
        onMaskChange: setHasMask,
      });

    const handleUndo = useCallback(() => {
      const canvas = maskCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const snap = undoStackRef.current.pop();
      if (!snap) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      } else {
        ctx.putImageData(snap, 0, 0);
      }
      recomputeHasMask();
    }, [recomputeHasMask]);

    const handleReset = useCallback(() => {
      const canvas = maskCanvasRef.current;
      const previewCanvas = previewCanvasRef.current;
      canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      previewCanvas?.getContext('2d')?.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      undoStackRef.current = [];
      setHasMask(false);
    }, []);

    const buildMaskBlob = useCallback(async (): Promise<Blob> => {
      const mask = maskCanvasRef.current;
      const baseCanvas = baseCanvasRef.current;
      if (!mask) throw new Error('mask canvas not ready');
      if (!baseCanvas) throw new Error('source image not ready');
      return await buildRedHighlightMaskBlob(baseCanvas, mask);
    }, []);

    // 建一个 loading 结果节点并连边，立即返回节点 id（同步，不等待上传/生成）。
    const createRedrawNode = useCallback(
      (sourceAspectRatio: string, masked: boolean, position: { x: number; y: number }) => {
        const generationStartedAt = Date.now();
        const displayName = masked ? t('redraw.maskedResult') : t('redraw.result');
        // 1→1 redraw / mask-redraw: inherit source's mainline fields so the
        // child still targets the same canonical slot at Push. user_spawned is
        // stamped by inheritMainlineFields; preset_managed never set.
        const initialData = inheritMainlineFields(
          { data: node.data as Record<string, unknown> },
          {
            displayName,
            imageUrl: null,
            previewImageUrl: null,
            aspectRatio: sourceAspectRatio,
            resultKind: 'generic',
            isGenerating: true,
            generationStartedAt,
            generationDurationMs: 60000,
          },
        );
        const nextNodeId = addNode(
          CANVAS_NODE_TYPES.exportImage,
          position,
          initialData as unknown as Parameters<typeof addNode>[2],
        );
        addEdge(node.id, nextNodeId);
        return nextNodeId;
      },
      [addEdge, addNode, node, t],
    );

    // 针对已建好的节点提交单图重绘（num_images=1）→ 轮询 → 回填。
    const runRedrawGeneration = useCallback(
      async (
        project: string,
        nodeId: string,
        sourceUrl: string,
        maskUrl: string | null,
        apiModel: string,
        modelSelector?: string,
      ) => {
        try {
          const { url } = await generateCanvasRedraw(
            {
              projectId: project,
              sourceUrl,
              maskUrl,
              prompt,
              aspectRatio,
              imageSize,
              model: apiModel,
              modelSelector,
            },
            (task) => {
              updateNodeData(nodeId, generationTaskDescriptor(task));
            },
          );
          updateNodeData(nodeId, {
            imageUrl: url,
            previewImageUrl: url,
            isGenerating: false,
            generationStartedAt: null,
            generationError: null,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error('[redraw] generation failed', err);
          updateNodeData(nodeId, {
            isGenerating: false,
            generationStartedAt: null,
            generationError: message,
          });
        }
      },
      [aspectRatio, imageSize, prompt, updateNodeData],
    );

    const handleSubmit = useCallback(async () => {
      if (submitting) return;
      if (!hasMask && !prompt.trim()) {
        setError(t('redraw.promptRequired'));
        return;
      }
      if (!selectedModel) {
        setError(t('modelPicker.empty'));
        return;
      }
      setError(null);
      setSubmitting(true);

      const sourceAspectRatio =
        typeof (node.data as { aspectRatio?: unknown }).aspectRatio === 'string'
          ? ((node.data as { aspectRatio?: string }).aspectRatio ?? DEFAULT_ASPECT_RATIO)
          : DEFAULT_ASPECT_RATIO;
      const base = findNodePosition(
        node.id,
        EXPORT_RESULT_NODE_DEFAULT_WIDTH,
        EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
      );

      // 后端 redraw 单次仅出 1 张：选了 N 张就建 N 个 loading 节点（纵向错开），
      // 蒙版只上传一次、多张共用，再各自发起 N 次单图请求、独立轮询/回填/报错。
      const count = Math.max(1, numImages);
      const nodeIds = Array.from({ length: count }, (_unused, i) =>
        createRedrawNode(sourceAspectRatio, hasMask, {
          x: base.x,
          y: base.y + i * (EXPORT_RESULT_NODE_LAYOUT_HEIGHT + RESULT_STACK_GAP),
        }),
      );
      setSelectedNode(nodeIds[0]);
      onClose();

      try {
        const sourceUrl = baseUrlRef.current;
        // 蒙版只需上传一次，多张共用同一份。
        let maskUrl: string | null = null;
        if (hasMask) {
          const maskBlob = await buildMaskBlob();
          const maskFile = new File([maskBlob], `mask-${node.id}-${Date.now()}.png`, {
            type: 'image/png',
          });
          const uploaded = await uploadCanvasAsset(
            projectId,
            maskFile,
            maskFile.name,
          );
          maskUrl = uploaded.url.split('?')[0];
        }
        const apiModel = selectedModel.apiModel;
        nodeIds.forEach((id) =>
          void runRedrawGeneration(
            projectId,
            id,
            sourceUrl,
            maskUrl,
            apiModel,
            selectedModel.routeSelector,
          ),
        );
      } catch (err) {
        // 蒙版上传等前置步骤失败：把所有占位节点标记为失败。
        const message = err instanceof Error ? err.message : String(err);
        console.error('[redraw] submit failed', err);
        nodeIds.forEach((id) =>
          updateNodeData(id, {
            isGenerating: false,
            generationStartedAt: null,
            generationError: message,
          }),
        );
      } finally {
        setSubmitting(false);
      }
    }, [
      buildMaskBlob,
      createRedrawNode,
      findNodePosition,
      hasMask,
      node,
      numImages,
      onClose,
      prompt,
      projectId,
      runRedrawGeneration,
      selectedModel,
      setSelectedNode,
      submitting,
      t,
      updateNodeData,
    ]);

    const cursor = useMemo(() => {
      if (!imageReady) return 'default';
      if (tool === 'rect') return 'crosshair';
      if (tool === 'eraser') return 'cell';
      return 'crosshair';
    }, [imageReady, tool]);

    const submitLabel = hasMask ? t('redraw.maskedSubmit') : t('redraw.fullSubmit');
    const brushPercent = ((brushSize - BRUSH_MIN) / (BRUSH_MAX - BRUSH_MIN)) * 100;
    const brushSliderStyle = {
      background: `linear-gradient(to right, rgb(var(--accent-rgb)) 0%, rgb(var(--accent-rgb)) ${brushPercent}%, rgb(var(--text-rgb) / 0.24) ${brushPercent}%, rgb(var(--text-rgb) / 0.24) 100%)`,
    };

    const overlay = (
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center bg-scrim p-4 backdrop-blur-sm"
        onClick={(event) => {
          if (event.target === event.currentTarget && !submitting) {
            onClose();
          }
        }}
      >
        <div
          className={REDRAW_MODAL_CLASS}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="pointer-events-none absolute left-4 right-4 top-3 z-10 flex h-9 items-center justify-between gap-3">
            <div className="pointer-events-auto flex items-center gap-5">
              <div className="flex items-center gap-2">
                <ToolBtn active={tool === 'brush'} onClick={() => setTool('brush')} title={t('redraw.brush')}>
                  <Brush className="h-4 w-4" />
                </ToolBtn>
                <ToolBtn active={tool === 'rect'} onClick={() => setTool('rect')} title={t('redraw.rectangle')}>
                  <Square className="h-4 w-4" />
                </ToolBtn>
                <ToolBtn active={tool === 'eraser'} onClick={() => setTool('eraser')} title={t('redraw.eraser')}>
                  <Eraser className="h-4 w-4" />
                </ToolBtn>
              </div>

              <div className="flex items-center gap-2 text-xs text-text-dark/68">
                <span className="whitespace-nowrap">{t('redraw.brushSize')}</span>
                <input
                  type="range"
                  min={BRUSH_MIN}
                  max={BRUSH_MAX}
                  step={2}
                  value={brushSize}
                  onChange={(event) => setBrushSize(Number(event.target.value))}
                  className={BRUSH_SLIDER_CLASS}
                  style={brushSliderStyle}
                />
                <span className="w-7 tabular-nums text-right text-text-dark/62">{brushSize}</span>
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-1">
              <button
                type="button"
                onClick={handleUndo}
                disabled={submitting || undoStackRef.current.length === 0}
                className={REDRAW_TEXT_BUTTON_CLASS}
                data-ui-tooltip={t('redraw.undoTitle')}
              >
                <Undo2 className="h-3.5 w-3.5" />
                {t('redraw.undo')}
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={submitting}
                className={REDRAW_TEXT_BUTTON_CLASS}
                data-ui-tooltip={t('redraw.resetTitle')}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('redraw.reset')}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className={REDRAW_TEXT_BUTTON_CLASS}
              >
                <X className="h-3.5 w-3.5" />
                {t('redraw.exit')}
              </button>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-media p-4 pt-14">
            {!imageReady && <div className="text-sm text-text-muted">{t('redraw.loadingSource')}</div>}
            <div
              className={`relative max-h-full max-w-full ${imageReady ? '' : 'hidden'}`}
              style={{ cursor }}
            >
              <canvas
                ref={baseCanvasRef}
                className="pointer-events-none block max-h-[calc(78vh-265px)] max-w-full"
              />
              <canvas
                ref={maskCanvasRef}
                className="pointer-events-none absolute inset-0 h-full w-full"
              />
              <canvas
                ref={previewCanvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className="absolute inset-0 h-full w-full"
                style={{ touchAction: 'none' }}
              />
            </div>
          </div>

          <div className="shrink-0 space-y-3 border-t border-border bg-card px-4 py-3">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              disabled={submitting}
              placeholder={
                hasMask
                  ? t('redraw.maskedPromptPlaceholder')
                  : t('redraw.fullPromptPlaceholder')
              }
              className={`${REDRAW_PROMPT_CLASS} ${CANVAS_NODE_INPUT_PLACEHOLDER_CLASS}`}
            />

            <div className="flex flex-wrap items-center gap-5 text-xs text-muted-foreground">
              <Field label={t('redraw.model')}>
                <ProviderModelPicker
                  selectedModelId={modelId}
                  onChange={setModelId}
                  models={availableModels}
                  imageMode="edit"
                  popoverPlacement="top"
                />
              </Field>
              <Field label={t('redraw.imageSize')}>
                <Select
                  value={imageSize}
                  onValueChange={(value) => {
                    if (value) setImageSize(value as CanvasRedrawImageSize);
                  }}
                  disabled={submitting}
                >
                  <SelectTrigger size="sm" className="min-w-20 border-transparent bg-transparent px-0 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent side="top" align="start">
                    {CANVAS_REDRAW_IMAGE_SIZES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('redraw.quantity')}>
                <Select
                  value={String(numImages)}
                  onValueChange={(value) => {
                    if (value) setNumImages(Number(value) as CanvasRedrawNumImages);
                  }}
                  disabled={submitting}
                >
                  <SelectTrigger size="sm" className="min-w-14 border-transparent bg-transparent px-0 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent side="top" align="start">
                    {CANVAS_REDRAW_NUM_IMAGES.map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('redraw.aspectRatio')}>
                <Select
                  value={aspectRatio}
                  onValueChange={(value) => {
                    if (value) setAspectRatio(value as CanvasRedrawAspectRatio);
                  }}
                  disabled={submitting}
                >
                  <SelectTrigger size="sm" className="min-w-16 border-transparent bg-transparent px-0 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent side="top" align="start">
                    {CANVAS_REDRAW_ASPECT_RATIOS.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="ml-auto flex items-center gap-2">
                {error && <span className="text-destructive">{error}</span>}
                <CreditCostPill
                  display={creditCost.data?.data.display}
                  className={NODE_CREDIT_PILL_FLAT_CLASS}
                />
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || !imageReady || !selectedModel}
                  className={REDRAW_CONFIRM_BUTTON_CLASS}
                  data-ui-tooltip={submitLabel}
                >
                  {t('toolDialog.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );

    if (typeof document === 'undefined') {
      return overlay;
    }

    return createPortal(overlay, document.body);
  });
}

export type RedrawOverlay = ReturnType<typeof createRedrawOverlay>;

function ToolBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      data-ui-tooltip={title}
      aria-label={title}
      className={
        'flex h-8 w-8 items-center justify-center rounded-full transition-colors ' +
        (active
          ? 'text-primary'
          : 'text-muted-foreground/75 hover:bg-muted hover:text-foreground')
      }
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span>{label}</span>
      {children}
    </div>
  );
}
