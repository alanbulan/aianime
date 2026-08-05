// Copyright (c) 2026 AI anime
import { memo, useCallback } from 'react';
import { NodeToolbar as ReactFlowNodeToolbar, Position } from '@xyflow/react';

;
import { useCanvasStore } from '@/features/canvas/canvasStore';
import { DEFAULT_ASPECT_RATIO, EXPORT_RESULT_NODE_DEFAULT_WIDTH, EXPORT_RESULT_NODE_LAYOUT_HEIGHT, LightEditorPanel, NODE_TOOLBAR_CLASS, ZoomScaledToolbar, generationTaskDescriptor, generateCanvasRelight, inheritMainlineFields, type LightEditorSubmitPayload, type LightMainLightDescriptor, type LightSmartModeDescriptor, type CanvasNode } from '@/modules/creative_canvas/public';

import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
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

interface LightEditorOverlayProps {
  projectId: string;
  node: CanvasNode;
  imageSource: string;
  onClose: () => void;
}

export const LightEditorOverlay = memo(
  ({ projectId, node, imageSource, onClose }: LightEditorOverlayProps) => {
    const addNode = useCanvasStore((state) => state.addNode);
    const addEdge = useCanvasStore((state) => state.addEdge);
    const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
    const findNodePosition = useCanvasStore((state) => state.findNodePosition);
    const updateNodeData = useCanvasStore((state) => state.updateNodeData);

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
          console.error('[light-editor] generation failed', err);
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

LightEditorOverlay.displayName = 'LightEditorOverlay';
