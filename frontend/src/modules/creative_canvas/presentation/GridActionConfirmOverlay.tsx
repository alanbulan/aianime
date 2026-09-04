// Copyright (c) 2026 AI anime
import { memo, useCallback, useState } from 'react';
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
import {
  resolveGridActionAspectRatio,
  resolveGridActionTemplateMode,
} from '../domain/gridAction';
import type { CanvasNode, CanvasNodeData } from '../domain/canvasNodeData';
import { inheritMainlineFields } from '../domain/inheritMainlineFields';
import {
  clearGenerationTaskDescriptor,
  generationTaskDescriptor,
} from '../application/resumeGeneration';
import type { CanvasGenerationTaskRef } from '../application/completeCanvasMediaGenerationTask';
import type {
  GenerateCanvasGridActionParams,
  GenerateCanvasGridActionResult,
} from '../application/generateCanvasGridAction';
import type { CanvasCatalogModelOption } from '../application/generationCatalog';
import { ProviderModelPicker } from './ProviderModelPicker';


export interface GridActionSubmitPayload {
  sourceNodeId: string;
  sourceUrl: string;
  actionKey: GridActionKey;
  label: string;
  prompt: string;
  cost: number;
  generationMode: 'image_reference';
  requestAspectRatio: 'original' | '3:2' | '16:9';
  catalogModelId: string;
  model: string;
  modelSelector?: string;
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
      const [modelId, setModelId] = useState('');
      const selectedModel =
        imageModels.find((model) => model.id === modelId)
        ?? imageModels[0];

      const handleSubmit = useCallback(async () => {
        if (!selectedModel) return;

        const sourceAspectRatio =
          typeof (node.data as { aspectRatio?: unknown }).aspectRatio === 'string'
            ? ((node.data as { aspectRatio?: string }).aspectRatio ?? DEFAULT_ASPECT_RATIO)
            : DEFAULT_ASPECT_RATIO;
        const requestAspectRatio = resolveGridActionAspectRatio(
          resolveGridActionTemplateMode(request.key),
        );
        const resultAspectRatio =
          requestAspectRatio === 'original'
            ? sourceAspectRatio
            : requestAspectRatio;
        const position = findNodePosition(
          node.id,
          EXPORT_RESULT_NODE_DEFAULT_WIDTH,
          EXPORT_RESULT_NODE_LAYOUT_HEIGHT
        );
        const generationStartedAt = Date.now();
        const submitPayload: GridActionSubmitPayload = {
          sourceNodeId: node.id,
          sourceUrl: imageSource,
          actionKey: request.key,
          label: request.label,
          prompt: request.prompt,
          cost: request.cost,
          generationMode: 'image_reference',
          requestAspectRatio,
          catalogModelId: selectedModel.id,
          model: selectedModel.apiModel,
          modelSelector: selectedModel.routeSelector,
          submittedAt: new Date(generationStartedAt).toISOString(),
        };
        const initialData = inheritMainlineFields(
          { data: node.data as Record<string, unknown> },
          {
            displayName: request.label,
            imageUrl: null,
            previewImageUrl: null,
            aspectRatio: resultAspectRatio,
            resultKind: 'generic' as const,
            isGenerating: true,
            generationStartedAt,
            generationDurationMs: 60000,
            gridActionRequest: submitPayload,
          },
        );
        const nextNodeId = addNode(
          CANVAS_NODE_TYPES.exportImage,
          position,
          initialData as unknown as Parameters<typeof addNode>[2],
        );
        addEdge(node.id, nextNodeId);
        setSelectedNode(nextNodeId);
        onClose();

        let taskKey: string | null = null;
        try {
          const { url } = await generateCanvasGridAction(
            {
              projectId,
              sourceUrl: submitPayload.sourceUrl,
              actionKey: submitPayload.actionKey,
              prompt: submitPayload.prompt,
              model: submitPayload.model,
              modelSelector: submitPayload.modelSelector,
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
            isGenerating: false,
            generationStartedAt: null,
            generationError: null,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error('[grid-action] generation failed', err);
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
            <ProviderModelPicker
              selectedModelId={modelId}
              onChange={setModelId}
              models={imageModels}
              imageMode="edit"
            />
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-foreground/90"
              onClick={handleSubmit}
              disabled={!selectedModel}
              data-ui-tooltip={t('nodeToolbar.gridMenu.confirmBar.submit')}
              aria-label={t('nodeToolbar.gridMenu.confirmBar.submit')}
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
