// Copyright (c) 2026 AI anime
import { memo, useCallback } from 'react';
import { NodeToolbar as ReactFlowNodeToolbar, Position } from '@xyflow/react';
import { ArrowUp, Globe2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CANVAS_NODE_TOOLBAR_PILL_CLASS } from './canvasNodeFrameStyles';
import {
  NODE_GENERATE_BUTTON_BASE_CLASS,
  NODE_GENERATE_BUTTON_ENABLED_CLASS,
} from './canvasNodeControlStyles';
import { NODE_TOOLBAR_CLASS } from './canvasNodeToolbarConfig';
import { ZoomScaledToolbar } from './ZoomScaledToolbar';
import { CANVAS_NODE_TYPES } from '../domain/canvasConnection';
import { CANVAS_SCENE_360_ASPECT_RATIO } from '../domain/scene360';
import type { CanvasNode, CanvasNodeData } from '../domain/canvasNodeData';
import {
  EXPORT_RESULT_NODE_DEFAULT_WIDTH,
  EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
} from '../domain/imageNodeLayout';
import {
  clearGenerationTaskDescriptor,
  generationTaskDescriptor,
} from '../application/resumeGeneration';
import type { CanvasGenerationTaskRef } from '../application/completeCanvasMediaGenerationTask';
import type {
  GenerateCanvasScene360Params,
  GenerateCanvasScene360Result,
} from '../application/generateCanvasScene360';
import type { CanvasCatalogModelOption } from '../application/generationCatalog';


const PANO_VIEWER_LAYOUT_WIDTH = 720;
const PANO_VIEWER_LAYOUT_HEIGHT = 420;

export interface Scene360OverlayStore {
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

export type Scene360OverlayStoreHook = <TSelected>(
  selector: (state: Scene360OverlayStore) => TSelected,
) => TSelected;

export type Scene360OverlayUseImageModels = (
  projectId: string,
  purpose: 'edit',
) => { models: CanvasCatalogModelOption[] };

export type Scene360OverlayGenerateScene360 = (
  params: GenerateCanvasScene360Params,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) => Promise<GenerateCanvasScene360Result>;

interface Scene360OverlayProps {
  projectId: string;
  canvasId: string;
  node: CanvasNode;
  imageSource: string;
  onClose: () => void;
}

export function createScene360Overlay({
  useStore,
  useCanvasImageModels,
  generateCanvasScene360,
}: {
  useStore: Scene360OverlayStoreHook;
  useCanvasImageModels: Scene360OverlayUseImageModels;
  generateCanvasScene360: Scene360OverlayGenerateScene360;
}) {
  return memo(({ projectId, canvasId, node, imageSource, onClose }: Scene360OverlayProps) => {
    const { t } = useTranslation();
    const addNode = useStore((state) => state.addNode);
    const addEdge = useStore((state) => state.addEdge);
    const setSelectedNode = useStore((state) => state.setSelectedNode);
    const findNodePosition = useStore((state) => state.findNodePosition);
    const updateNodeData = useStore((state) => state.updateNodeData);
    const { models: imageModels } = useCanvasImageModels(projectId, 'edit');
    const selectedModel = imageModels[0];

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
          aspectRatio: CANVAS_SCENE_360_ASPECT_RATIO,
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

      let taskKey: string | null = null;
      try {
        const { url } = await generateCanvasScene360(
          {
            projectId,
            referenceUrl: imageSource,
            canvasId,
            nodeId: nextNodeId,
            model: selectedModel.apiModel,
            modelSelector: selectedModel.routeSelector,
          },
          (task) => {
            taskKey = task.task_key;
            updateNodeData(nextNodeId, generationTaskDescriptor(task));
          },
        );
        updateNodeData(nextNodeId, {
          ...clearGenerationTaskDescriptor(taskKey),
          imageUrl: url,
          previewImageUrl: url,
          aspectRatio: CANVAS_SCENE_360_ASPECT_RATIO,
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
          ...clearGenerationTaskDescriptor(taskKey),
          isGenerating: false,
          generationStartedAt: null,
          generationError: message,
        });
      }
    }, [
      addEdge,
      addNode,
      canvasId,
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
            data-ui-tooltip={t('scene360.exit')}
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-1.5 px-2 text-xs text-text-dark">
            <Globe2 className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            <span className="truncate font-medium">{t('scene360.label')}</span>
          </div>

          <span
            className="inline-flex h-7 items-center rounded px-1.5 text-xs font-medium text-text-dark/88"
            aria-label={t('scene360.aspectRatioLabel')}
            data-ui-tooltip={t('scene360.aspectRatioLabel')}
          >
            {CANVAS_SCENE_360_ASPECT_RATIO}
          </span>
          <button
            type="button"
            className={`${NODE_GENERATE_BUTTON_BASE_CLASS} shrink-0 ${NODE_GENERATE_BUTTON_ENABLED_CLASS}`}
            onClick={handleSubmit}
            disabled={!selectedModel}
            data-ui-tooltip={t('scene360.submit')}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
        </ZoomScaledToolbar>
      </ReactFlowNodeToolbar>
    );
  });
}

export type Scene360Overlay = ReturnType<typeof createScene360Overlay>;
