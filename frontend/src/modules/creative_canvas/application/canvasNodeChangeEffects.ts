// Copyright (c) 2026 AI anime
import {
  createSnapshot,
  recordCanvasInteractionHistory,
  type CanvasHistorySnapshot,
  type CanvasHistoryState,
} from '../domain/canvasHistory';
import {
  isDeleteToEmpty,
  trackEdit,
  type CanvasMutationState,
} from '../domain/canvasMutation';
import {
  classifyCanvasNodeChanges,
  type CanvasNodeChangeLike,
} from '../domain/canvasChangeIntent';
import {
  resolveActiveToolDialog,
  resolveSelectedNodeId,
  type CanvasSelectionDialogTarget,
} from '../domain/canvasSelection';
import {
  isImageAutoResizableType,
  withManualSizeLock,
  type CanvasImageLayoutNode,
} from '../domain/imageNodeLayout';

export interface CanvasNodeChangeEffectNode extends CanvasImageLayoutNode {
  readonly id: string;
}

export interface CanvasNodeChangeEffectState<
  TNode extends CanvasNodeChangeEffectNode,
  TEdge,
  TDialog extends CanvasSelectionDialogTarget,
> extends CanvasMutationState {
  nodes: TNode[];
  edges: TEdge[];
  selectedNodeId: string | null;
  activeToolDialog: TDialog | null;
  history: CanvasHistoryState<TNode, TEdge>;
  dragHistorySnapshot: CanvasHistorySnapshot<TNode, TEdge> | null;
}

export interface CanvasNodeChangeEffectResult<
  TNode extends CanvasNodeChangeEffectNode,
  TEdge,
  TDialog extends CanvasSelectionDialogTarget,
> {
  nodes: TNode[];
  selectedNodeId: string | null;
  activeToolDialog: TDialog | null;
  history: CanvasHistoryState<TNode, TEdge>;
  dragHistorySnapshot: CanvasHistorySnapshot<TNode, TEdge> | null;
  userEditsSinceHydrate?: number;
  lastMutationSource?: CanvasMutationState['lastMutationSource'];
}

export function applyCanvasNodeChangeEffects<
  TNode extends CanvasNodeChangeEffectNode,
  TEdge,
  TDialog extends CanvasSelectionDialogTarget,
>(
  state: CanvasNodeChangeEffectState<TNode, TEdge, TDialog>,
  changedNodes: TNode[],
  changes: readonly CanvasNodeChangeLike[],
): CanvasNodeChangeEffectResult<TNode, TEdge, TDialog> {
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
