// Copyright (c) 2026 AI anime
import { memo, useCallback } from 'react';
import { NodeToolbar as ReactFlowNodeToolbar, Position } from '@xyflow/react';
import { ArrowUp, Image as ImageIcon, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CANVAS_NODE_TOOLBAR_PILL_CLASS } from './canvasNodeFrameStyles';
import { NODE_TOOLBAR_CLASS } from './canvasNodeToolbarConfig';
import { DEFAULT_ASPECT_RATIO } from '../domain/aspectRatio';
import {
  EXPORT_RESULT_NODE_DEFAULT_WIDTH,
  EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
} from '../domain/imageNodeLayout';
import { CANVAS_NODE_TYPES } from '../domain/canvasConnection';
import type {
  GridActionKey,
  GridActionRequest,
} from '../domain/gridAction';
import type { CanvasNode, CanvasNodeData } from '../domain/canvasNodeData';
import { generationTaskDescriptor } from '../application/resumeGeneration';
import type { CanvasGenerationTaskRef } from '../application/completeCanvasMediaGenerationTask';
import type {
  GenerateCanvasGridActionParams,
  GenerateCanvasGridActionResult,
} from '../application/generateCanvasGridAction';
import type { CanvasCatalogModelOption } from '../application/generationCatalog';


export interface GridActionSubmitPayload {
  sourceNodeId: string;
  imageSource: string;
  actionKey: GridActionKey;
  label: string;
  prompt: string;
  cost: number;
  generationMode: 'image_reference';
  requestAspectRatio: 'auto';
  submittedAt: string;
}

export interface GridActionConfirmOverlayStore {
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

export type GridActionConfirmOverlayStoreHook = <TSelected>(
  selector: (state: GridActionConfirmOverlayStore) => TSelected,
) => TSelected;

export type GridActionConfirmOverlayUseImageModels = (
  projectId: string,
  purpose: 'edit',
) => { models: CanvasCatalogModelOption[] };

export type GridActionConfirmOverlayGenerateGridAction = (
  params: GenerateCanvasGridActionParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) => Promise<GenerateCanvasGridActionResult>;

interface GridActionConfirmOverlayProps {
  projectId: string;
  node: CanvasNode;
  imageSource: string;
  request: GridActionRequest;
  onClose: () => void;
}

export function createGridActionConfirmOverlay({
  useStore,
  useCanvasImageModels,
  generateCanvasGridAction,
}: {
  useStore: GridActionConfirmOverlayStoreHook;
  useCanvasImageModels: GridActionConfirmOverlayUseImageModels;
  generateCanvasGridAction: GridActionConfirmOverlayGenerateGridAction;
}) {
  return memo(
    ({
      projectId,
      node,
      imageSource,
      request,
      onClose,
    }: GridActionConfirmOverlayProps) => {
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

        const sourceAspectRatio =
          typeof (node.data as { aspectRatio?: unknown }).aspectRatio === 'string'
            ? ((node.data as { aspectRatio?: string }).aspectRatio ?? DEFAULT_ASPECT_RATIO)
            : DEFAULT_ASPECT_RATIO;
        const position = findNodePosition(
          node.id,
          EXPORT_RESULT_NODE_DEFAULT_WIDTH,
          EXPORT_RESULT_NODE_LAYOUT_HEIGHT
        );
        const generationStartedAt = Date.now();
        const nextNodeId = addNode(
          CANVAS_NODE_TYPES.exportImage,
          position,
          {
            displayName: request.label,
            imageUrl: null,
            previewImageUrl: null,
            aspectRatio: sourceAspectRatio,
            resultKind: 'generic',
            isGenerating: true,
            generationStartedAt,
          }
        );
        addEdge(node.id, nextNodeId);
        setSelectedNode(nextNodeId);
        onClose();

        try {
          const { url } = await generateCanvasGridAction(
            {
              projectId,
              sourceUrl: imageSource,
              actionKey: request.key,
              prompt: request.label,
              model: selectedModel.apiModel,
              modelSelector: selectedModel.routeSelector,
            },
            (task) => {
              updateNodeData(nextNodeId, generationTaskDescriptor(task));
            },
          );
          updateNodeData(nextNodeId, {
            imageUrl: url,
            previewImageUrl: url,
            isGenerating: false,
            generationStartedAt: null,
            generationError: null,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error('[grid-action] generation failed', err);
          updateNodeData(nextNodeId, {
            isGenerating: false,
            generationStartedAt: null,
            generationError: message,
          });
        }
      }, [
        addEdge,
        addNode,
        findNodePosition,
        imageSource,
        node,
        onClose,
        projectId,
        request,
        selectedModel,
        setSelectedNode,
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
          <div
            className={`flex min-w-[420px] items-center gap-2 ${CANVAS_NODE_TOOLBAR_PILL_CLASS}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={onClose}
              data-ui-tooltip={t('nodeToolbar.gridMenu.confirmBar.close')}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex min-w-0 flex-1 items-center gap-1.5 px-2 text-xs text-foreground">
              <ImageIcon className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              <span className="truncate font-medium">{request.label}</span>
            </div>
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-foreground/90"
              onClick={handleSubmit}
              disabled={!selectedModel}
              data-ui-tooltip={t('nodeToolbar.gridMenu.confirmBar.submit')}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </ReactFlowNodeToolbar>
      );
    }
  );
}

export type GridActionConfirmOverlay = ReturnType<
  typeof createGridActionConfirmOverlay
>;
