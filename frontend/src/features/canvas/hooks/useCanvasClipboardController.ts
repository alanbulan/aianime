// Copyright (c) 2026 AI anime
import { useCallback } from 'react';
import type { Connection, NodeChange } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  clearBrowserClipboard,
  migratePastedNodeAssets,
} from '@/features/canvas/composition';
import {
  createCanvasClipboardSession,
  createCanvasClipboardSnapshot,
  useCanvasNodeClipboard,
  type CanvasNodeClipboardController,
} from '@/modules/creative_canvas/public';
import { cloneCanvasNodeData } from '../application/canvasNodeData';
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
} from '../domain/canvasNodes';
import {
  useCanvasClipboardDuplicationController,
  type CanvasClipboardDuplicationController,
  type CanvasClipboardNodeDimensionCommit,
  type CanvasClipboardNodeSelectionCommit,
} from './useCanvasClipboardDuplicationController';

const canvasNodeClipboardSession = createCanvasClipboardSession<
  CanvasNode,
  CanvasEdge
>();

function reportCanvasClipboardMigrationError(error: unknown): void {
  console.warn('[canvas] cross-project asset migration failed', error);
}

export interface CanvasClipboardControllerOptions {
  nodes: readonly CanvasNode[];
  edges: readonly CanvasEdge[];
  selectedNodeIds: readonly string[];
  currentProject: string | null;
  getGraph: () => {
    nodes: readonly CanvasNode[];
    edges: readonly CanvasEdge[];
  };
  createNode: (
    type: CanvasNodeType,
    position: { x: number; y: number },
    data?: Partial<CanvasNodeData>,
  ) => string;
  applyNodeChanges: (changes: NodeChange<CanvasNode>[]) => void;
  connectNodes: (connection: Connection) => void;
  selectNode: (nodeId: string | null) => void;
  updateNodeData: (
    nodeId: string,
    patch: Partial<CanvasNodeData>,
  ) => void;
  queueSnapshotPaste: (pasteSnapshot: () => void) => void;
}

export interface CanvasClipboardController extends CanvasNodeClipboardController {
  duplicateNodes: CanvasClipboardDuplicationController['duplicateNodes'];
}

export function useCanvasClipboardController({
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
}: CanvasClipboardControllerOptions): CanvasClipboardController {
  const { t } = useTranslation();
  const commitNodeDimensions = useCallback(
    (updates: CanvasClipboardNodeDimensionCommit[]) => {
      applyNodeChanges(updates.map((update) => ({
        id: update.nodeId,
        type: 'dimensions' as const,
        dimensions: { width: update.width, height: update.height },
        resizing: false,
        setAttributes: true,
      })));
    },
    [applyNodeChanges],
  );
  const commitNodeSelection = useCallback(
    (updates: CanvasClipboardNodeSelectionCommit[]) => {
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
    createNode,
    commitNodeDimensions,
    connectNodes,
    commitNodeSelection,
    selectNode,
    currentProject,
    migrateAssets: migratePastedNodeAssets,
    updateNodeData,
    notifyMigrationSuccess,
    notifyMigrationPartialFailure,
    reportMigrationError: reportCanvasClipboardMigrationError,
  });
  const createSnapshot = useCallback(
    () => createCanvasClipboardSnapshot({
      nodes,
      edges,
      selectedNodeIds,
      sourceProject: currentProject,
      cloneNode: (node, state) => ({
        ...node,
        ...state,
        data: cloneCanvasNodeData(node.data),
      }),
      cloneEdge: (edge) => ({ ...edge }),
    }),
    [currentProject, edges, nodes, selectedNodeIds],
  );
  const nodeClipboard = useCanvasNodeClipboard({
    session: canvasNodeClipboardSession,
    createSnapshot,
    pasteSnapshot: pasteFromClipboard,
    queueSnapshotPaste,
    resetPasteIteration,
    clearSystemClipboard: clearBrowserClipboard,
  });

  return {
    duplicateNodes,
    ...nodeClipboard,
  };
}
