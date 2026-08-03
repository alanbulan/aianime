// Copyright (c) 2026 AI anime
import {
  createSnapshot,
  isDeleteToEmpty,
  recordCanvasInteractionHistory,
  resolveActiveToolDialog,
  resolveSelectedNodeId,
  trackEdit,
  type CanvasHistorySnapshot,
  type CanvasHistoryState,
  type CanvasMutationState,
} from '@/modules/creative_canvas/public';
import type {
  ActiveToolDialog,
  CanvasEdge,
  CanvasNode,
} from '../domain/canvasNodes';
import {
  classifyCanvasNodeChanges,
  type CanvasNodeChangeLike,
} from './canvasChangeIntent';
import {
  isImageAutoResizableType,
  withManualSizeLock,
} from './imageNodeLayout';

export interface CanvasNodeChangeEffectState extends CanvasMutationState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeId: string | null;
  activeToolDialog: ActiveToolDialog | null;
  history: CanvasHistoryState<CanvasNode, CanvasEdge>;
  dragHistorySnapshot: CanvasHistorySnapshot<CanvasNode, CanvasEdge> | null;
}

export interface CanvasNodeChangeEffectResult {
  nodes: CanvasNode[];
  selectedNodeId: string | null;
  activeToolDialog: ActiveToolDialog | null;
  history: CanvasHistoryState<CanvasNode, CanvasEdge>;
  dragHistorySnapshot: CanvasHistorySnapshot<CanvasNode, CanvasEdge> | null;
  userEditsSinceHydrate?: number;
  lastMutationSource?: CanvasMutationState['lastMutationSource'];
}

export function applyCanvasNodeChangeEffects(
  state: CanvasNodeChangeEffectState,
  changedNodes: CanvasNode[],
  changes: readonly CanvasNodeChangeLike[],
): CanvasNodeChangeEffectResult {
  const intent = classifyCanvasNodeChanges(changes);
  const nodes = intent.resizedNodeIds.size === 0
    ? changedNodes
    : changedNodes.map((node) => {
        if (
          !intent.resizedNodeIds.has(node.id)
          || !isImageAutoResizableType(node.type)
        ) {
          return node;
        }
        return withManualSizeLock(node);
      });
  const historyResult = recordCanvasInteractionHistory(
    {
      history: state.history,
      dragHistorySnapshot: state.dragHistorySnapshot,
    },
    createSnapshot(state.nodes, state.edges),
    intent,
  );
  const editSource = isDeleteToEmpty(state.nodes.length, nodes.length)
    ? 'delete_to_empty'
    : 'user_edit';

  return {
    nodes,
    selectedNodeId: resolveSelectedNodeId(state.selectedNodeId, nodes),
    activeToolDialog: resolveActiveToolDialog(state.activeToolDialog, nodes),
    history: historyResult.history,
    dragHistorySnapshot: historyResult.dragHistorySnapshot,
    ...(historyResult.editPushed ? trackEdit(state, editSource) : {}),
  };
}
