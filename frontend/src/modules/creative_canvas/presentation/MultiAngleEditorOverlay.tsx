// Copyright (c) 2026 AI anime
import { memo, useCallback } from 'react';
import { NodeToolbar as ReactFlowNodeToolbar, Position } from '@xyflow/react';

import {
  MultiAngleEditorPanel,
  type MultiAngleSubmitPayload,
} from './MultiAngleEditorPanel';
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
import { generationTaskDescriptor } from '../application/resumeGeneration';
import type { CanvasGenerationTaskRef } from '../application/completeCanvasMediaGenerationTask';
import type {
  GenerateCanvasMultiAngleParams,
  GenerateCanvasMultiAngleResult,
} from '../application/generateCanvasMultiAngle';

export interface MultiAngleEditorOverlayStore {
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

export type MultiAngleEditorOverlayStoreHook = <TSelected>(
  selector: (state: MultiAngleEditorOverlayStore) => TSelected,
) => TSelected;

export type MultiAngleEditorOverlayGenerateMultiAngle = (
  params: GenerateCanvasMultiAngleParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) => Promise<GenerateCanvasMultiAngleResult>;

interface MultiAngleEditorOverlayProps {
  projectId: string;
  node: CanvasNode;
  imageSource: string;
  onClose: () => void;
}

export function createMultiAngleEditorOverlay({
  useStore,
  generateCanvasMultiAngle,
}: {
  useStore: MultiAngleEditorOverlayStoreHook;
  generateCanvasMultiAngle: MultiAngleEditorOverlayGenerateMultiAngle;
}) {
  return memo(
    ({ projectId, node, imageSource, onClose }: MultiAngleEditorOverlayProps) => {
      const addNode = useStore((state) => state.addNode);
      const addEdge = useStore((state) => state.addEdge);
      const setSelectedNode = useStore((state) => state.setSelectedNode);
      const findNodePosition = useStore((state) => state.findNodePosition);
      const updateNodeData = useStore((state) => state.updateNodeData);

      const handleSubmit = useCallback(
        async (payload: MultiAngleSubmitPayload) => {
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
          // 1→1 spawn from MultiAngleEditor (one camera angle at a time).
          // User-confirmed: even when this overlay spawns N candidates in
          // sequence, all of them inherit the same slot_target — Push lands
          // whichever one the user picks. inheritMainlineFields stamps
          // user_spawned: true and refuses preset_managed.
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

          try {
            const { url } = await generateCanvasMultiAngle(
              {
                projectId,
                sourceUrl: imageSource,
                preset: payload.preset,
                yawDegrees: payload.horizontalDeg,
                pitchDegrees: payload.verticalDeg,
                shotSize: payload.zoom,
                promptOverride: payload.promptOverride,
                model: payload.apiModel,
                imageSize: payload.imageSize,
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
            console.error('[multi-angle] generation failed', err);
            updateNodeData(nextNodeId, {
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
            <MultiAngleEditorPanel
              projectId={projectId}
              imageSource={imageSource}
              onClose={onClose}
              onSubmit={handleSubmit}
            />
          </ZoomScaledToolbar>
        </ReactFlowNodeToolbar>
      );
    },
  );
}

export type MultiAngleEditorOverlay = ReturnType<
  typeof createMultiAngleEditorOverlay
>;
