// Copyright (c) 2026 AI anime
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { NodeToolbar as ReactFlowNodeToolbar, Position } from '@xyflow/react';
import { ArrowUp, Check, ChevronDown, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CANVAS_NODE_TOOLBAR_CARD_CLASS } from './canvasNodeFrameStyles';
import {
  NODE_GENERATE_BUTTON_BASE_CLASS,
  NODE_GENERATE_BUTTON_ENABLED_CLASS,
} from './canvasNodeControlStyles';
import { NODE_TOOLBAR_CLASS } from './canvasNodeToolbarConfig';
import { ProviderModelPicker } from './ProviderModelPicker';
import { ZoomScaledToolbar } from './ZoomScaledToolbar';
import {
  CANVAS_UPSCALE_IMAGE_SIZES,
  resolveCanvasUpscaleImageSize,
  type CanvasUpscaleImageSize,
} from '../domain/upscale';
import { generationTaskDescriptor } from '../application/resumeGeneration';
import type { CanvasGenerationTaskRef } from '../application/completeCanvasMediaGenerationTask';
import type {
  GenerateCanvasUpscaleParams,
  GenerateCanvasUpscaleResult,
} from '../application/generateCanvasUpscale';
import type { CanvasCatalogModelOption } from '../application/generationCatalog';
import type { CanvasNode, CanvasNodeData } from '../domain/canvasNodeData';


export interface UpscaleEditorOverlayStore {
  updateNodeData: (id: string, patch: Partial<CanvasNodeData>) => void;
  deleteNode: (nodeId: string) => void;
  setSelectedNode: (id: string | null) => void;
}

export type UpscaleEditorOverlayStoreHook = <TSelected>(
  selector: (state: UpscaleEditorOverlayStore) => TSelected,
) => TSelected;

export type UpscaleEditorOverlayUseImageModels = (
  projectId: string,
  purpose: 'edit',
) => { models: CanvasCatalogModelOption[] };

export type UpscaleEditorOverlayGenerateUpscale = (
  params: GenerateCanvasUpscaleParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) => Promise<GenerateCanvasUpscaleResult>;
interface UpscalePersistedFields {
  upscaleSourceUrl?: string;
  upscaleModelId?: string;
  upscaleImageSize?: CanvasUpscaleImageSize;
}

interface UpscaleEditorOverlayProps {
  projectId: string;
  /**
   * The upscale-result ExportImage node. The panel is always anchored beneath it
   * while the node is selected — settings are persisted on `node.data` so they
   * survive re-selection.
   */
  node: CanvasNode;
}

export function createUpscaleEditorOverlay({
  useStore,
  useCanvasImageModels,
  generateCanvasUpscale,
}: {
  useStore: UpscaleEditorOverlayStoreHook;
  useCanvasImageModels: UpscaleEditorOverlayUseImageModels;
  generateCanvasUpscale: UpscaleEditorOverlayGenerateUpscale;
}) {
  return memo(({ projectId, node }: UpscaleEditorOverlayProps) => {
  const { t } = useTranslation();
  const updateNodeData = useStore((state) => state.updateNodeData);
  const deleteNode = useStore((state) => state.deleteNode);
  const setSelectedNode = useStore((state) => state.setSelectedNode);

  const persisted = node.data as UpscalePersistedFields;
  const sourceUrl = persisted.upscaleSourceUrl ?? '';
  const persistedModelId =
    typeof persisted.upscaleModelId === 'string' ? persisted.upscaleModelId : '';
  const { models: availableModels } = useCanvasImageModels(projectId, 'edit');
  const persistedImageSize = resolveCanvasUpscaleImageSize(persisted.upscaleImageSize);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedModel =
    availableModels.find((m) => m.id === persistedModelId)
    ?? availableModels[0];

  const handleModelChange = useCallback(
    (modelId: string) => {
      updateNodeData(node.id, { upscaleModelId: modelId });
    },
    [node.id, updateNodeData],
  );

  const handleImageSizeChange = useCallback(
    (size: CanvasUpscaleImageSize) => {
      updateNodeData(node.id, { upscaleImageSize: size });
    },
    [node.id, updateNodeData],
  );

  const handleCancel = useCallback(() => {
    deleteNode(node.id);
    setSelectedNode(null);
  }, [deleteNode, node.id, setSelectedNode]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting || !selectedModel) return;
    if (!sourceUrl) {
      console.error('[upscale] missing upscaleSourceUrl on node.data — cannot submit');
      return;
    }
    const apiModel = selectedModel.apiModel;

    setIsSubmitting(true);
    const generationStartedAt = Date.now();
    updateNodeData(node.id, {
      isGenerating: true,
      generationStartedAt,
      generationError: null,
    });

    try {
      const { url } = await generateCanvasUpscale(
        {
          projectId,
          sourceUrl,
          imageSize: persistedImageSize,
          model: apiModel,
          modelSelector: selectedModel.routeSelector,
        },
        (task) => {
          updateNodeData(node.id, generationTaskDescriptor(task));
        },
      );
      updateNodeData(node.id, {
        imageUrl: url,
        previewImageUrl: url,
        isGenerating: false,
        generationStartedAt: null,
        generationError: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[upscale] generation failed', err);
      updateNodeData(node.id, {
        isGenerating: false,
        generationStartedAt: null,
        generationError: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    node.id,
    persistedImageSize,
    projectId,
    selectedModel,
    sourceUrl,
    updateNodeData,
  ]);

  return (
    <ReactFlowNodeToolbar
      nodeId={node.id}
      isVisible
      position={Position.Bottom}
      align="center"
      offset={12}
      className={NODE_TOOLBAR_CLASS}
    >
      {/* 操作区按画布缩放同步缩放：面板挂在节点下方，锚点取顶边（贴着节点底边），
          画布缩小时面板朝节点收缩、视觉上与节点同比变小。 */}
      <ZoomScaledToolbar origin="top center">
        <div
          className={`w-[400px] p-4 ${CANVAS_NODE_TOOLBAR_CARD_CLASS}`}
          onClick={(event) => event.stopPropagation()}
        >
        <div className="mb-3 flex items-center justify-between border-b border-border pb-2.5">
          <div className="text-sm font-semibold text-text-dark">
            {t('upscaleEditor.title')}
          </div>
          <button
            type="button"
            className="text-xs text-text-muted transition-colors hover:text-text-dark"
            onClick={handleCancel}
            data-ui-tooltip={t('upscaleEditor.cancel')}
          >
            {t('common.cancel')}
          </button>
        </div>

        <div className="space-y-3">
          <PanelRow label={t('modelParams.model')}>
            <ProviderModelPicker
              selectedModelId={persistedModelId}
              onChange={handleModelChange}
              models={availableModels}
              imageMode="edit"
            />
          </PanelRow>

          <PanelRow label={t('upscaleEditor.qualityLabel')}>
            <QualityPicker value={persistedImageSize} onChange={handleImageSizeChange} />
          </PanelRow>

        </div>

        <div className="mt-4 flex items-center justify-end gap-3 border-t border-border pt-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedModel}
            className={`${NODE_GENERATE_BUTTON_BASE_CLASS} ${NODE_GENERATE_BUTTON_ENABLED_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
            data-ui-tooltip={t('upscaleEditor.submit')}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
        </div>
      </ZoomScaledToolbar>
    </ReactFlowNodeToolbar>
  );
  });
}

export type UpscaleEditorOverlay = ReturnType<
  typeof createUpscaleEditorOverlay
>;

function PanelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-text-muted">{label}</span>
      {children}
    </div>
  );
}

interface QualityPickerProps {
  value: CanvasUpscaleImageSize;
  onChange: (value: CanvasUpscaleImageSize) => void;
}

function QualityPicker({ value, onChange }: QualityPickerProps) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (
        triggerRef.current?.contains(event.target as Node) ||
        popoverRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown, true);
    return () => document.removeEventListener('mousedown', onPointerDown, true);
  }, [isOpen]);

  const title = t('upscaleEditor.qualityPicker.title');

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-foreground transition-colors hover:border-foreground/25 hover:bg-accent"
      >
        <Sparkles className="h-3.5 w-3.5 text-text-muted" />
        <span className="font-medium">{title}</span>
        <span className="text-text-muted">·</span>
        <span className="text-text-muted">{value}</span>
        <ChevronDown className="h-3 w-3 text-text-muted" />
      </button>
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute bottom-full right-0 z-50 mb-2 w-[240px] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-2xl"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="mb-1 text-[11px] uppercase tracking-wide text-text-muted">{title}</div>
          <div className="flex gap-1.5">
            {CANVAS_UPSCALE_IMAGE_SIZES.map((size) => {
              const isActive = value === size;
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => {
                    onChange(size);
                    setIsOpen(false);
                  }}
                  className={`inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-full px-3 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground hover:bg-accent'
                  }`}
                >
                  {isActive && <Check className="h-3 w-3" />}
                  {size}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
