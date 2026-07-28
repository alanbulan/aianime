// Copyright (c) 2026 AI anime
import { memo, useCallback } from 'react';
import { NodeToolbar as ReactFlowNodeToolbar, Position } from '@xyflow/react';

import {
  CANVAS_NODE_TYPES,
  DEFAULT_ASPECT_RATIO,
  EXPORT_RESULT_NODE_DEFAULT_WIDTH,
  EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
  type CanvasNode,
} from '@/features/canvas/domain/canvasNodes';
import { useCanvasStore } from '@/features/canvas/canvasStore';
import {
  MultiAngleEditorPanel,
  type MultiAngleSubmitPayload,
} from '@/features/canvas/ui/MultiAngleEditorPanel';
import { generateCanvasMultiAngle } from '@/features/canvas/composition';
import { generationTaskDescriptor } from '@/features/canvas/application/resumeGeneration';
import { readUrl } from '@/lib/url-params';
import { inheritMainlineFields } from '@/features/canvas/domain/inheritMainlineFields';
import { NODE_TOOLBAR_CLASS } from './nodeToolbarConfig';
import { ZoomScaledToolbar } from './ZoomScaledToolbar';

interface MultiAngleEditorOverlayProps {
  node: CanvasNode;
  imageSource: string;
  onClose: () => void;
}

export const MultiAngleEditorOverlay = memo(
  ({ node, imageSource, onClose }: MultiAngleEditorOverlayProps) => {
    const addNode = useCanvasStore((state) => state.addNode);
    const addEdge = useCanvasStore((state) => state.addEdge);
    const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
    const findNodePosition = useCanvasStore((state) => state.findNodePosition);
    const updateNodeData = useCanvasStore((state) => state.updateNodeData);

    const handleSubmit = useCallback(
      async (payload: MultiAngleSubmitPayload) => {
        const project = readUrl().project;
        if (!project) {
          console.error('[multi-angle] no project in URL — cannot submit');
          return;
        }

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
              projectId: project,
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
            imageSource={imageSource}
            onClose={onClose}
            onSubmit={handleSubmit}
          />
        </ZoomScaledToolbar>
      </ReactFlowNodeToolbar>
    );
  },
);

MultiAngleEditorOverlay.displayName = 'MultiAngleEditorOverlay';
