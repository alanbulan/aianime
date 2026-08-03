// Copyright (c) 2026 AI anime
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type {
  CanvasClipboardAssetMigrationRequest,
  CanvasClipboardAssetMigrationSummary,
} from '../application/canvasClipboardAssetMigration';
import type { CanvasClipboardDuplicationPorts } from '../application/canvasClipboardDuplication';
import type { CanvasClipboardSession } from '../application/canvasClipboardSession';
import { createCanvasClipboardSnapshot } from '../application/createCanvasClipboardSnapshot';
import {
  useCanvasClipboardDuplicationController,
  type CanvasClipboardDuplicationController,
  type CanvasClipboardSelectableNode,
} from './useCanvasClipboardDuplicationController';
import {
  useCanvasNodeClipboard,
  type CanvasNodeClipboardController,
} from './useCanvasNodeClipboard';

export interface CanvasClipboardControllerEdge {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface CanvasClipboardNodeDimensionChange {
  id: string;
  type: 'dimensions';
  dimensions: { width: number; height: number };
  resizing: false;
  setAttributes: true;
}

export interface CanvasClipboardNodeSelectionChange {
  id: string;
  type: 'select';
  selected: boolean;
}

export type CanvasClipboardNodeChange =
  | CanvasClipboardNodeDimensionChange
  | CanvasClipboardNodeSelectionChange;

export interface CanvasClipboardControllerPorts<
  TNode extends CanvasClipboardSelectableNode<TNodeData>,
  TEdge extends CanvasClipboardControllerEdge,
  TNodeType,
  TNodeData extends object,
> {
  duplication: CanvasClipboardDuplicationPorts<TNode, TNodeType, TNodeData>;
  cloneSnapshotNode: (
    node: TNode,
    state: { selected: false; dragging: false },
  ) => TNode;
  cloneSnapshotEdge: (edge: TEdge) => TEdge;
}

export interface CanvasClipboardControllerDependencies<
  TNode,
  TEdge,
  TNodeData extends object,
> {
  session: CanvasClipboardSession<TNode, TEdge>;
  migrateAssets: (
    params: CanvasClipboardAssetMigrationRequest<TNodeData>,
  ) => Promise<CanvasClipboardAssetMigrationSummary>;
  clearSystemClipboard: () => Promise<void>;
  reportMigrationError: (error: unknown) => void;
}

export interface CanvasClipboardControllerOptions<
  TNode extends CanvasClipboardSelectableNode<TNodeData>,
  TEdge extends CanvasClipboardControllerEdge,
  TNodeType,
  TNodeData extends object,
> {
  nodes: readonly TNode[];
  edges: readonly TEdge[];
  selectedNodeIds: readonly string[];
  currentProject: string | null;
  getGraph: () => {
    nodes: readonly TNode[];
    edges: readonly TEdge[];
  };
  createNode: (
    type: TNodeType,
    position: { x: number; y: number },
    data?: Partial<TNodeData>,
  ) => string;
  applyNodeChanges: (changes: CanvasClipboardNodeChange[]) => void;
  connectNodes: (connection: {
    source: string;
    target: string;
    sourceHandle: string;
    targetHandle: string;
  }) => void;
  selectNode: (nodeId: string | null) => void;
  updateNodeData: (nodeId: string, patch: Partial<TNodeData>) => void;
  queueSnapshotPaste: (pasteSnapshot: () => void) => void;
}

export interface CanvasClipboardController<TNode, TEdge>
  extends CanvasNodeClipboardController {
  duplicateNodes: CanvasClipboardDuplicationController<
    TNode,
    TEdge
  >['duplicateNodes'];
}

export function createUseCanvasClipboardController<
  TNode extends CanvasClipboardSelectableNode<TNodeData>,
  TEdge extends CanvasClipboardControllerEdge,
  TNodeType,
  TNodeData extends object,
>(
  ports: CanvasClipboardControllerPorts<TNode, TEdge, TNodeType, TNodeData>,
  dependencies: CanvasClipboardControllerDependencies<TNode, TEdge, TNodeData>,
) {
  return function useCanvasClipboardController({
    nodes,
    edges,
    selectedNodeIds,
    currentProject,
    getGraph,
    createNode,
    applyNodeChanges,
    connectNodes,
    selectNode,
    updateNodeData,
    queueSnapshotPaste,
  }: CanvasClipboardControllerOptions<
    TNode,
    TEdge,
    TNodeType,
    TNodeData
  >): CanvasClipboardController<TNode, TEdge> {
    const { t } = useTranslation();
    const commitNodeDimensions = useCallback(
      (updates: Array<{ nodeId: string; width: number; height: number }>) => {
        applyNodeChanges(updates.map((update) => ({
          id: update.nodeId,
          type: 'dimensions' as const,
          dimensions: { width: update.width, height: update.height },
          resizing: false as const,
          setAttributes: true as const,
        })));
      },
      [applyNodeChanges],
    );
    const commitNodeSelection = useCallback(
      (updates: Array<{ nodeId: string; selected: boolean }>) => {
        applyNodeChanges(updates.map((update) => ({
          id: update.nodeId,
          type: 'select' as const,
          selected: update.selected,
        })));
      },
      [applyNodeChanges],
    );
    const notifyMigrationSuccess = useCallback(
      (count: number) => {
        toast.success(t('canvas.crossProjectAssets.success', { count }));
      },
      [t],
    );
    const notifyMigrationPartialFailure = useCallback(
      (count: number) => {
        toast.error(t('canvas.crossProjectAssets.partialFailure', { count }));
      },
      [t],
    );
    const {
      duplicateNodes,
      pasteFromClipboard,
      resetPasteIteration,
    } = useCanvasClipboardDuplicationController({
      getGraph,
      duplicationPorts: ports.duplication,
      createNode,
      commitNodeDimensions,
      connectNodes,
      commitNodeSelection,
      selectNode,
      currentProject,
      migrateAssets: dependencies.migrateAssets,
      updateNodeData,
      notifyMigrationSuccess,
      notifyMigrationPartialFailure,
      reportMigrationError: dependencies.reportMigrationError,
    });
    const createSnapshot = useCallback(
      () => createCanvasClipboardSnapshot({
        nodes,
        edges,
        selectedNodeIds,
        sourceProject: currentProject,
        cloneNode: ports.cloneSnapshotNode,
        cloneEdge: ports.cloneSnapshotEdge,
      }),
      [currentProject, edges, nodes, selectedNodeIds],
    );
    const nodeClipboard = useCanvasNodeClipboard({
      session: dependencies.session,
      createSnapshot,
      pasteSnapshot: pasteFromClipboard,
      queueSnapshotPaste,
      resetPasteIteration,
      clearSystemClipboard: dependencies.clearSystemClipboard,
    });

    return {
      duplicateNodes,
      ...nodeClipboard,
    };
  };
}
