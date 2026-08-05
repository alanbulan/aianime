// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUpdateNodeInternals } from '@xyflow/react';

import { CANVAS_NODE_TYPES } from '../domain/canvasConnection';
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
  ScriptNodeData,
} from '../domain/canvasNodeData';
import type { CanvasGenerationHistoryRecord } from '../domain/generationHistoryRecord';
import { resolveNodeDisplayName } from '../domain/nodeDisplay';
import {
  SCRIPT_NODE_ACTIONS,
  hasScriptGenerationSource,
  hasScriptReferencePreview,
  resolveScriptNodeReferences,
  resolveScriptNodeResult,
  resolveScriptNodeSize,
  resolveScriptNodeSpawnPlan,
  scriptPromptHasContent,
  updateScriptResultCell,
  type ScriptGenAction,
} from '../application/scriptNodeModel';
import {
  STORY_SCRIPT_SOURCE_REQUIRED_MESSAGE,
  buildCanvasStoryScriptCommand,
  isCanvasStoryScriptResult,
  type CanvasStoryScriptReference,
  type GenerateCanvasStoryScriptParams,
  type GenerateCanvasStoryScriptResult,
} from '../application/generateCanvasStoryScript';
import { generationTaskDescriptor } from '../application/resumeGeneration';
import type {
  TranslateCanvasTextParams,
  TranslateCanvasTextResult,
} from '../application/translateCanvasText';
import type { CanvasGenerationTaskRef } from '../application/completeCanvasMediaGenerationTask';
import { useNodeGenerationHistory } from './useNodeGenerationHistory';
import { useNodeGenerationTaskState } from './useNodeGenerationTaskState';

import { useGenerationCreditCost } from '@/modules/model_usage/public';

const REFERENCE_PREVIEW_WIDTH = 240;
const REFERENCE_PREVIEW_OFFSET = 10;

export interface ScriptNodeStore {
  setSelectedNode: (id: string | null) => void;
  selectedNodeId: string | null;
  updateNodeData: (id: string, patch: Partial<CanvasNodeData>) => void;
  nodes: readonly CanvasNode[];
  edges: readonly CanvasEdge[];
  addNode: (
    type: CanvasNodeType,
    position: { x: number; y: number },
    data?: Partial<CanvasNodeData>,
  ) => string;
  addEdge: (source: string, target: string) => string | null;
  autoGroupSpawn: (
    sourceNodeId: string,
    spawnedNodeIds: string[],
    options?: { label?: string },
  ) => string | null;
}

export type ScriptNodeStoreHook = {
  <TSelected>(selector: (state: ScriptNodeStore) => TSelected): TSelected;
  getState: () => ScriptNodeStore;
};

export type ScriptNodeUpstreamNodesHook = (
  nodeId: string,
) => readonly CanvasNode[];

export type ScriptNodeGenerateStoryScript = (
  params: GenerateCanvasStoryScriptParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) => Promise<GenerateCanvasStoryScriptResult>;

export type ScriptNodeTranslateText = (
  params: Omit<TranslateCanvasTextParams, "model"> & { model?: string },
) => Promise<TranslateCanvasTextResult>;

export interface ScriptNodeControllerOptions {
  id: string;
  data: ScriptNodeData;
  selected?: boolean;
  width?: number;
  height?: number;
  projectId: string;
  canvasId: string;
}

export function createUseScriptNodeController({
  useStore,
  useUpstreamNodes,
  generateCanvasStoryScript,
  translateCanvasText,
}: {
  useStore: ScriptNodeStoreHook;
  useUpstreamNodes: ScriptNodeUpstreamNodesHook;
  generateCanvasStoryScript: ScriptNodeGenerateStoryScript;
  translateCanvasText: ScriptNodeTranslateText;
}) {
  return function useScriptNodeController({
    id,
    data,
    selected,
    width,
    height,
    projectId,
    canvasId,
  }: ScriptNodeControllerOptions) {
    const updateNodeInternals = useUpdateNodeInternals();
    const setSelectedNode = useStore((state) => state.setSelectedNode);
    const selectedNodeId = useStore((state) => state.selectedNodeId);
    const updateNodeData = useStore((state) => state.updateNodeData);
    const upstreamNodes = useUpstreamNodes(id);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);
    const [panelExpanded, setPanelExpanded] = useState(false);
    const [referencePreviewPosition, setReferencePreviewPosition] = useState<{
      nodeId: string;
      left: number;
      top: number;
      width: number;
    } | null>(null);

    const title = useMemo(
      () => resolveNodeDisplayName(CANVAS_NODE_TYPES.script, data),
      [data],
    );
    const scriptResult = useMemo(
      () => resolveScriptNodeResult(data.scriptResult),
      [data.scriptResult],
    );
    const rows = scriptResult?.rows ?? [];
    const hasResult = rows.length > 0;
    const size = useMemo(
      () => resolveScriptNodeSize(hasResult, width, height),
      [hasResult, height, width],
    );
    const headerSubtitle =
      scriptResult?.title?.trim() || data.scriptTitle?.trim() || '';
    const references = useMemo(
      () => resolveScriptNodeReferences(upstreamNodes),
      [upstreamNodes],
    );
    const referencePreview = useMemo(() => {
      if (!referencePreviewPosition) return null;
      const index = references.findIndex(
        (reference) => reference.nodeId === referencePreviewPosition.nodeId,
      );
      if (index < 0) return null;
      return {
        reference: references[index],
        index,
        left: referencePreviewPosition.left,
        top: referencePreviewPosition.top,
        width: referencePreviewPosition.width,
      };
    }, [referencePreviewPosition, references]);
    const hasUpstream = references.length > 0;
    const isNodeSelected = Boolean(selected) || selectedNodeId === id;
    const prompt = typeof data.prompt === 'string' ? data.prompt : '';
    const {
      records: historyRecords,
      isLoading: historyLoading,
      refresh: refreshHistory,
    } = useNodeGenerationHistory({
      projectId,
      canvasId,
      nodeId: id,
      enabled: isNodeSelected,
    });
    const { isGenerating } = useNodeGenerationTaskState(data);
    const hasGenerationSource = hasScriptGenerationSource(prompt, references);
    const submitDisabled = isGenerating || !hasGenerationSource;
    const showOperationsPanel =
      isNodeSelected && (hasUpstream || scriptPromptHasContent(data));
    const scriptCost = useGenerationCreditCost(
      showOperationsPanel ? 'freezone_story_script' : '',
    );

    const submit = useCallback(async () => {
      if (isGenerating) return;
      if (!projectId) {
        console.error('[script-node] submit: missing project context');
        updateNodeData(id, { generationError: '缺少 project 参数' });
        return;
      }

      const command = buildCanvasStoryScriptCommand({
        references,
        prompt,
        canvasId,
        nodeId: id,
      });
      if (!command) {
        updateNodeData(id, {
          generationError: STORY_SCRIPT_SOURCE_REQUIRED_MESSAGE,
        });
        return;
      }

      updateNodeData(id, {
        isGenerating: true,
        generationStartedAt: Date.now(),
        generationError: null,
      });
      try {
        const result = await generateCanvasStoryScript(
          { projectId, command },
          (task) => {
            updateNodeData(id, generationTaskDescriptor(task));
          },
        );
        updateNodeData(id, {
          isGenerating: false,
          generationStartedAt: null,
          scriptResult: result.scriptResult,
          scriptTitle: result.scriptResult.title ?? null,
          generationError: null,
        });
      } catch (error) {
        console.error('[script-node] submit failed', error);
        updateNodeData(id, {
          isGenerating: false,
          generationStartedAt: null,
          generationError: error instanceof Error ? error.message : '生成失败',
        });
      } finally {
        void refreshHistory();
      }
    }, [
      canvasId,
      id,
      isGenerating,
      projectId,
      prompt,
      references,
      refreshHistory,
      updateNodeData,
    ]);

    const commitCell = useCallback(
      (rowIndex: number, columnKey: string, nextValue: string) => {
        if (!scriptResult) return;
        const updated = updateScriptResultCell(
          scriptResult,
          rowIndex,
          columnKey,
          nextValue,
        );
        if (updated) {
          updateNodeData(id, { scriptResult: updated });
        }
      },
      [id, scriptResult, updateNodeData],
    );

    const pickAction = useCallback(
      (action: ScriptGenAction) => {
        const state = useStore.getState();
        const self = state.nodes.find((node) => node.id === id);
        if (!self) return;
        const plan = resolveScriptNodeSpawnPlan({
          action,
          self,
          nodes: state.nodes,
          edges: state.edges,
          fallbackHeight: size.height,
        });
        const nodeIds = plan.items.map((item) => {
          const nodeId = state.addNode(item.type, item.position, item.data);
          state.addEdge(nodeId, id);
          return nodeId;
        });
        state.autoGroupSpawn(id, nodeIds, { label: plan.groupLabel });
        updateNodeData(id, { lastAction: action });
      },
      [id, size.height, updateNodeData],
    );

    const translate = useCallback(async () => {
      if (isGenerating || isTranslating || prompt.trim().length === 0) return;
      if (!projectId) {
        console.error('[script-node] translate: missing project context');
        return;
      }
      setIsTranslating(true);
      try {
      const result = await translateCanvasText({
          projectId,
          text: prompt,
          nodeType: 'text',
          canvasId,
          nodeId: id,
        });
        updateNodeData(id, { prompt: result.translatedText });
      } catch (error) {
        console.error('[script-node] translate failed', error);
      } finally {
        setIsTranslating(false);
      }
    }, [
      canvasId,
      id,
      isGenerating,
      isTranslating,
      projectId,
      prompt,
      updateNodeData,
    ]);

    const restoreHistory = useCallback(
      (record: CanvasGenerationHistoryRecord) => {
        if (!isCanvasStoryScriptResult(record.result)) return;
        updateNodeData(id, {
          scriptResult: record.result,
          scriptTitle: record.result.title ?? null,
          isGenerating: false,
          generationStartedAt: null,
        });
      },
      [id, updateNodeData],
    );

    const isHistoryRecordActive = useCallback(
      (record: CanvasGenerationHistoryRecord) => {
        if (
          !isCanvasStoryScriptResult(record.result) ||
          !isCanvasStoryScriptResult(data.scriptResult)
        ) {
          return false;
        }
        return JSON.stringify(record.result) === JSON.stringify(data.scriptResult);
      },
      [data.scriptResult],
    );

    const showReferencePreview = useCallback(
      (
        reference: CanvasStoryScriptReference,
        rect: Pick<DOMRect, 'left' | 'top' | 'width'>,
      ) => {
        if (!hasScriptReferencePreview(reference)) return;
        const left = Math.max(
          8,
          Math.min(
            window.innerWidth - REFERENCE_PREVIEW_WIDTH - 8,
            rect.left + rect.width / 2 - REFERENCE_PREVIEW_WIDTH / 2,
          ),
        );
        setReferencePreviewPosition({
          nodeId: reference.nodeId,
          left,
          top: rect.top - REFERENCE_PREVIEW_OFFSET,
          width: REFERENCE_PREVIEW_WIDTH,
        });
      },
      [],
    );

    useEffect(() => {
      updateNodeInternals(id);
    }, [id, size.height, size.width, updateNodeInternals]);

    useEffect(() => {
      if (!isFullscreen) return;
      const handleKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') setIsFullscreen(false);
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
    }, [isFullscreen]);

    useEffect(() => {
      if (showOperationsPanel) return;
      setIsTranslating(false);
      setPanelExpanded(false);
      setReferencePreviewPosition(null);
    }, [showOperationsPanel]);

    useEffect(() => {
      if (referencePreviewPosition && !referencePreview) {
        setReferencePreviewPosition(null);
      }
    }, [referencePreview, referencePreviewPosition]);

    return {
      data,
      selected: isNodeSelected,
      title,
      rows,
      hasResult,
      size,
      headerSubtitle,
      references,
      hasUpstream,
      prompt,
      historyRecords,
      historyLoading,
      isGenerating,
      isTranslating,
      isFullscreen,
      panelExpanded,
      referencePreview,
      actions: SCRIPT_NODE_ACTIONS,
      showOperationsPanel,
      submitDisabled,
      scriptCostDisplay: scriptCost.data?.data.display,
      select: () => setSelectedNode(id),
      rename: (displayName: string) => updateNodeData(id, { displayName }),
      changePrompt: (nextPrompt: string) =>
        updateNodeData(id, { prompt: nextPrompt }),
      commitCell,
      pickAction,
      submit,
      translate,
      restoreHistory,
      refreshHistory,
      isHistoryRecordActive,
      openFullscreen: () => setIsFullscreen(true),
      closeFullscreen: () => setIsFullscreen(false),
      collapsePanel: () => setPanelExpanded(false),
      togglePanel: () => setPanelExpanded((current) => !current),
      showReferencePreview,
      hideReferencePreview: () => setReferencePreviewPosition(null),
    };
  };
}

export type ScriptNodeController = ReturnType<
  ReturnType<typeof createUseScriptNodeController>
>;
