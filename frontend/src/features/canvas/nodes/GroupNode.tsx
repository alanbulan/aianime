// Copyright (c) 2026 AI anime
import { createElement, memo, useMemo } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';

import { useCanvasStore } from '@/features/canvas/canvasStore';
import { uploadCanvasAsset } from '@/features/canvas/composition';
import {
  CANVAS_NODE_TYPES,
  resolveNodeSourceImageUrl,
  type CanvasNode,
  type GroupNodeData,
} from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { CanvasHistoryAssetsModalAdapter } from '@/features/canvas/ui/CanvasHistoryAssetsModalAdapter';
import {
  NodeHeader,
  NODE_HEADER_FLOATING_POSITION_CLASS,
} from '@/features/canvas/ui/NodeHeader';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import { canvasNodeFrameClass } from '@/features/canvas/ui/nodeFrameStyles';
import {
  GroupNodeView,
  computeSnapAlign,
  getStoryboardCellPreview,
  useSnapAlignStore,
  useGroupNodeController,
  type GroupNodeControllerPorts,
  type GroupNodeViewBindings,
  type StoryboardCellPreviewPorts,
} from '@/modules/creative_canvas/public';

const STORYBOARD_CELL_PREVIEW_PORTS: StoryboardCellPreviewPorts<CanvasNode> = {
  types: {
    video: [
      CANVAS_NODE_TYPES.video,
      CANVAS_NODE_TYPES.videoStory,
      CANVAS_NODE_TYPES.videoCompose,
    ],
    storyboard: [
      CANVAS_NODE_TYPES.storyboardSplit,
      CANVAS_NODE_TYPES.storyboardGen,
    ],
    audio: [CANVAS_NODE_TYPES.audio],
    script: [
      CANVAS_NODE_TYPES.script,
      CANVAS_NODE_TYPES.textAnnotation,
    ],
    image: [
      CANVAS_NODE_TYPES.upload,
      CANVAS_NODE_TYPES.imageEdit,
      CANVAS_NODE_TYPES.imageGen,
      CANVAS_NODE_TYPES.exportImage,
    ],
  },
  resolveSourceImageUrl: resolveNodeSourceImageUrl,
};

type GroupNodeProps = NodeProps & {
  id: string;
  data: GroupNodeData;
  projectId: string;
  selected?: boolean;
};

export const GroupNode = memo((props: GroupNodeProps) => {
  const { id, data, projectId, selected } = props;
  const { t } = useTranslation();
  const reactFlow = useReactFlow();
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const fitGroupToChildren = useCanvasStore(
    (state) => state.fitGroupToChildren,
  );
  const reorderStoryboardMember = useCanvasStore(
    (state) => state.reorderStoryboardMember,
  );
  const addStoryboardMembers = useCanvasStore(
    (state) => state.addStoryboardMembers,
  );
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const isInteracting = useCanvasStore(
    (state) => state.dragHistorySnapshot !== null,
  );
  const groupScopedNodes = useCanvasStore(
    useShallow((state) =>
      state.nodes.filter((node) => node.id === id || node.parentId === id),
    ),
  );
  const snapEnabled = useSnapAlignStore((state) => state.enabled);
  const setSnapGuides = useSnapAlignStore((state) => state.setGuides);
  const clearSnapGuides = useSnapAlignStore((state) => state.clearGuides);
  const ports = useMemo<GroupNodeControllerPorts>(
    () => ({
      translate: (key, options) => String(t(key, options)),
      uploadAsset: (targetProjectId, file, displayName) =>
        uploadCanvasAsset(targetProjectId, file, displayName),
      notify: (message) => toast(message),
      reportUploadError: (error) => {
        console.error('[storyboard] upload failed', error);
      },
      updateNodeData: (nodeId, patch) => {
        updateNodeData(nodeId, patch);
      },
      fitGroupToChildren,
      reorderStoryboardMember,
      addStoryboardMembers,
      deleteNode,
      resolveGroupTitle: (groupData) =>
        resolveNodeDisplayName(
          CANVAS_NODE_TYPES.group,
          groupData as GroupNodeData,
        ),
      resolveStoryboardCellPreview: (node) =>
        getStoryboardCellPreview(
          node as CanvasNode,
          STORYBOARD_CELL_PREVIEW_PORTS,
        ),
      computeSnapAlign: (draggedNode, proposedPosition, otherNodes) =>
        computeSnapAlign(
          draggedNode as CanvasNode,
          proposedPosition,
          otherNodes as CanvasNode[],
        ),
      getViewportZoom: () => reactFlow.getViewport().zoom || 1,
      setSnapGuides,
      clearSnapGuides,
    }),
    [
      addStoryboardMembers,
      clearSnapGuides,
      deleteNode,
      fitGroupToChildren,
      reactFlow,
      reorderStoryboardMember,
      setSnapGuides,
      t,
      updateNodeData,
    ],
  );
  const controller = useGroupNodeController({
    id,
    data,
    projectId,
    selected,
    groupScopedNodes,
    isInteracting,
    snapEnabled,
    ports,
  });
  const bindings: GroupNodeViewBindings = {
    nodeFrameClass: canvasNodeFrameClass({ selected }),
    headerPositionClass: NODE_HEADER_FLOATING_POSITION_CLASS,
    historyModal: controller.historyOpen
      ? createElement(CanvasHistoryAssetsModalAdapter, {
          projectId: controller.projectId,
          canvasId: null,
          imageOnly: true,
          assetSource: 'live-canvas',
          onClose: controller.closeHistory,
          onUseAsset: controller.pickHistoryAsset,
          onDeleteNode: controller.deleteHistoryNode,
        })
      : null,
    renderHeader: (options) => createElement(NodeHeader, options),
    renderResizeHandle: (options) =>
      createElement(NodeResizeHandle, options),
  };
  return createElement(GroupNodeView, { controller, bindings });
});

GroupNode.displayName = 'GroupNode';
