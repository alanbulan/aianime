// Copyright (c) 2026 AI anime
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { NodeToolbar as ReactFlowNodeToolbar, Position } from '@xyflow/react';
import { ArrowUp, ChevronDown, Globe2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { type CanvasNode } from '@/features/canvas/domain/canvasNodes';
import {
  CANVAS_NODE_TOOLBAR_PILL_CLASS,
  CANVAS_SCENE_360_ASPECT_RATIOS,
  DEFAULT_CANVAS_SCENE_360_ASPECT_RATIO,
  EXPORT_RESULT_NODE_DEFAULT_WIDTH,
  EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
  NODE_FLOATING_PANEL_SURFACE_CLASS,
  NODE_GENERATE_BUTTON_BASE_CLASS,
  NODE_GENERATE_BUTTON_ENABLED_CLASS,
  NODE_TOOLBAR_CLASS,
  ZoomScaledToolbar,
  generationTaskDescriptor,
  generateCanvasScene360,
  useCanvasImageModels,
  type CanvasScene360AspectRatio,
} from '@/modules/creative_canvas/public';
import { CreditCostInline } from '@/components/credit-cost-inline';
import { useCanvasStore } from '@/features/canvas/canvasStore';
import { useGenerationCreditCost } from '@/modules/model_usage/public';

import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
const PANO_VIEWER_LAYOUT_WIDTH = 720;
const PANO_VIEWER_LAYOUT_HEIGHT = 420;

interface Scene360OverlayProps {
  projectId: string;
  node: CanvasNode;
  imageSource: string;
  onClose: () => void;
}

export const Scene360Overlay = memo(
  ({ projectId, node, imageSource, onClose }: Scene360OverlayProps) => {
    const { t } = useTranslation();
    const addNode = useCanvasStore((state) => state.addNode);
    const addEdge = useCanvasStore((state) => state.addEdge);
    const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
    const findNodePosition = useCanvasStore((state) => state.findNodePosition);
    const updateNodeData = useCanvasStore((state) => state.updateNodeData);
    const { models: imageModels } = useCanvasImageModels(projectId, 'edit');
    const selectedModel = imageModels[0];
    const panoCost = useGenerationCreditCost(
      'image_selection',
      selectedModel?.apiModel ?? null,
      {
        surface: 'canvas',
        params: { size: '2K', quality: 'medium' },
      },
    );

    // 全景输出比例（生成参数，仅影响本次出图，不改节点的展示比例）。
    const [aspectRatio, setAspectRatio] = useState<CanvasScene360AspectRatio>(
      DEFAULT_CANVAS_SCENE_360_ASPECT_RATIO,
    );

    const handleSubmit = useCallback(async () => {
      if (!selectedModel) return;

      const position = findNodePosition(
        node.id,
        EXPORT_RESULT_NODE_DEFAULT_WIDTH,
        EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
      );
      const generationStartedAt = Date.now();
      const nextNodeId = addNode(
        CANVAS_NODE_TYPES.exportImage,
        position,
        {
          displayName: t('scene360.label'),
          imageUrl: null,
          previewImageUrl: null,
          aspectRatio,
          resultKind: 'generic',
          output_role: 'scene_360_candidate',
          media_kind: 'pano360',
          isGenerating: true,
          generationStartedAt,
        },
      );
      addEdge(node.id, nextNodeId);
      setSelectedNode(nextNodeId);
      onClose();

      try {
        const { url } = await generateCanvasScene360(
          {
            projectId,
            referenceUrl: imageSource,
            aspectRatio,
            model: selectedModel.apiModel,
          },
          (task) => {
            updateNodeData(nextNodeId, generationTaskDescriptor(task));
          },
        );
        updateNodeData(nextNodeId, {
          imageUrl: url,
          previewImageUrl: url,
          aspectRatio,
          output_role: 'scene_360_candidate',
          media_kind: 'pano360',
          isGenerating: false,
          generationStartedAt: null,
          generationError: null,
        });

        const viewerPosition = findNodePosition(
          nextNodeId,
          PANO_VIEWER_LAYOUT_WIDTH,
          PANO_VIEWER_LAYOUT_HEIGHT,
        );
        const viewerNodeId = addNode(CANVAS_NODE_TYPES.pano360Viewer, viewerPosition);
        addEdge(nextNodeId, viewerNodeId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[scene-360] generation failed', err);
        updateNodeData(nextNodeId, {
          isGenerating: false,
          generationStartedAt: null,
          generationError: message,
        });
      }
    }, [
      addEdge,
      addNode,
      aspectRatio,
      findNodePosition,
      imageSource,
      node,
      onClose,
      projectId,
      selectedModel,
      setSelectedNode,
      t,
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
        {/* 操作区跟随画布缩放（align=center → 锚点顶边中点，贴节点底边）。 */}
        <ZoomScaledToolbar origin="top center">
        <div
          className={`flex min-w-[420px] items-center gap-2 ${CANVAS_NODE_TOOLBAR_PILL_CLASS}`}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-dark/70 text-text-muted transition-colors hover:bg-bg-dark hover:text-text-dark"
            onClick={onClose}
            title={t('scene360.exit')}
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-1.5 px-2 text-xs text-text-dark">
            <Globe2 className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            <span className="truncate font-medium">{t('scene360.label')}</span>
          </div>

          <AspectRatioDropdown
            value={aspectRatio}
            onChange={setAspectRatio}
            label={t('scene360.aspectRatioLabel')}
          />
          <CreditCostInline display={panoCost.data?.data.display} />

          <button
            type="button"
            className={`${NODE_GENERATE_BUTTON_BASE_CLASS} shrink-0 ${NODE_GENERATE_BUTTON_ENABLED_CLASS}`}
            onClick={handleSubmit}
            disabled={!selectedModel}
            title={t('scene360.submit')}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
        </ZoomScaledToolbar>
      </ReactFlowNodeToolbar>
    );
  },
);

Scene360Overlay.displayName = 'Scene360Overlay';

interface AspectRatioDropdownProps {
  value: CanvasScene360AspectRatio;
  onChange: (value: CanvasScene360AspectRatio) => void;
  label: string;
}

function AspectRatioDropdown({ value, onChange, label }: AspectRatioDropdownProps) {
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

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={label}
        title={label}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className="inline-flex h-7 items-center gap-1 rounded px-1.5 text-xs font-medium text-text-dark/88 transition-colors hover:text-text-dark"
      >
        <span>{value}</span>
        <ChevronDown className="h-3 w-3 text-text-muted" />
      </button>
      {isOpen && (
        <div
          ref={popoverRef}
          role="listbox"
          className={`absolute bottom-full right-0 z-50 mb-2 min-w-[88px] p-1 ${NODE_FLOATING_PANEL_SURFACE_CLASS}`}
          onClick={(event) => event.stopPropagation()}
        >
          {CANVAS_SCENE_360_ASPECT_RATIOS.map((ratio) => {
            const isActive = ratio === value;
            return (
              <button
                key={ratio}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onChange(ratio);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {ratio}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
