// Copyright (c) 2026 AI anime
import { memo, useCallback } from 'react';
import { NodeToolbar as ReactFlowNodeToolbar, Position } from '@xyflow/react';

import {
  LightEditorPanel,
  type LightEditorSubmitPayload,
  type LightMainLightDescriptor,
  type LightSmartModeDescriptor,
} from './LightEditorPanel';
import { NODE_TOOLBAR_CLASS } from './canvasNodeToolbarConfig';
import { ZoomScaledToolbar } from './ZoomScaledToolbar';
import { DEFAULT_ASPECT_RATIO } from '../domain/aspectRatio';
import {
  EXPORT_RESULT_NODE_DEFAULT_WIDTH,
  EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
} from '../domain/imageNodeLayout';
import { CANVAS_NODE_TYPES } from '../domain/canvasConnection';
import { inheritMainlineFields } from '../domain/inheritMainlineFields';
import type { CanvasNode, CanvasNodeData } from '../domain/canvasNodeData';
import {
  clearGenerationTaskDescriptor,
  generationTaskDescriptor,
} from '../application/resumeGeneration';
import type { CanvasGenerationTaskRef } from '../application/completeCanvasMediaGenerationTask';
import type {
  GenerateCanvasRelightParams,
  GenerateCanvasRelightResult,
} from '../application/generateCanvasRelight';

export interface LightEditorRequestPayload {
  sourceNodeId: string;
  imageSource: string;
  brightness: number;
  color: string;
  mainLight: LightMainLightDescriptor;
  rimLight: boolean;
  smartMode: LightSmartModeDescriptor;
  prompt: string;
  displayName: string;
  generationMode: 'image_reference';
  requestAspectRatio: 'auto';
  submittedAt: string;
}

export interface LightEditorOverlayStore {
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

export type LightEditorOverlayStoreHook = <TSelected>(
  selector: (state: LightEditorOverlayStore) => TSelected,
) => TSelected;

export type LightEditorOverlayGenerateRelight = (
  params: GenerateCanvasRelightParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) => Promise<GenerateCanvasRelightResult>;

interface LightEditorOverlayProps {
  projectId: string;
  node: CanvasNode;
  imageSource: string;
  onClose: () => void;
}

export function createLightEditorOverlay({
  useStore,
  generateCanvasRelight,
}: {
  useStore: LightEditorOverlayStoreHook;
  generateCanvasRelight: LightEditorOverlayGenerateRelight;
}) {
  return memo(
    ({ projectId, node, imageSource, onClose }: LightEditorOverlayProps) => {
      const addNode = useStore((state) => state.addNode);
      const addEdge = useStore((state) => state.addEdge);
      const setSelectedNode = useStore((state) => state.setSelectedNode);
      const findNodePosition = useStore((state) => state.findNodePosition);
      const updateNodeData = useStore((state) => state.updateNodeData);

      const handleSubmit = useCallback(
        async (payload: LightEditorSubmitPayload) => {
          const sourceAspectRatio =
            typeof (node.data as { aspectRatio?: unknown }).aspectRatio === 'string'
              ? ((node.data as { aspectRatio?: string }).aspectRatio ?? DEFAULT_ASPECT_RATIO)
              : DEFAULT_ASPECT_RATIO;
          const position = findNodePosition(
            node.id,
            EXPORT_RESULT_NODE_DEFAULT_WIDTH,
            EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
          );
          const generationStartedAt = Date.now();
          // 1→1 relight: child inherits source's mainline fields (mainline_context
          // + slot_target + committed_slot_url) so the new node still represents
          // "another candidate for the same canonical slot" — Push lands the
          // original Push target. inheritMainlineFields stamps user_spawned: true
          // and refuses to set preset_managed.
          const initialData = inheritMainlineFields(
            { data: node.data as Record<string, unknown> },
            {
              displayName: payload.displayName,
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
          setSelectedNode(nextNodeId);
          onClose();

          let taskKey: string | null = null;
          try {
            const { url } = await generateCanvasRelight(
              {
                projectId,
                sourceUrl: imageSource,
                brightness: payload.brightness,
                colorHex: payload.color,
                colorTemperatureKelvin: payload.colorTemperatureKelvin,
                keyLightCandidate: payload.mainLight.nearestPreset,
                rimLight: payload.rimLight,
                smartMode: payload.smartMode,
                imageSize: payload.imageSize,
                model: payload.apiModel,
                modelSelector: payload.modelSelector,
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
            console.error('[light-editor] generation failed', err);
            updateNodeData(nextNodeId, {
              ...clearGenerationTaskDescriptor(taskKey),
              isGenerating: false,
              generationStartedAt: null,
              generationError: message,
            });
          }
        },
        [
          addEdge,
          addNode,
          findNodePosition,
          imageSource,
          node,
          onClose,
          projectId,
          setSelectedNode,
          updateNodeData,
        ],
      );

      return (
        <ReactFlowNodeToolbar
          nodeId={node.id}
          isVisible
          position={Position.Bottom}
          align="start"
          offset={16}
          className={NODE_TOOLBAR_CLASS}
        >
          {/* 操作区跟随画布缩放（align=start → 锚点左上角，贴节点底边）。 */}
          <ZoomScaledToolbar origin="top left">
            <LightEditorPanel
              projectId={projectId}
              imageSource={imageSource}
              onClose={onClose}
              onSubmit={handleSubmit}
            />
          </ZoomScaledToolbar>
        </ReactFlowNodeToolbar>
      );
    }
  );
}

export type LightEditorOverlay = ReturnType<typeof createLightEditorOverlay>;
