// Copyright (c) 2026 AI anime
import {
  CANVAS_NODE_TYPES,
  DEFAULT_ASPECT_RATIO,
  type CanvasNode,
  type CanvasNodeData,
  type CanvasNodeType,
} from '../domain/canvasNodes';
import type {
  StoryboardExportOptions,
  StoryboardFrameItem,
} from '@/modules/creative_canvas/public';
import { nodeCatalog } from './nodeCatalog';
import { createCanvasNodeDefaultData } from './canvasNodeDefaultData';
import type { CanvasNodeDefaultDataGateway } from './ports';
import { createDefaultStoryboardExportOptions } from './storyboardNodeModel';

export const SKILL_NODE_DEFAULT_MEASURED = { width: 380, height: 520 };
export const BEAT_CONTEXT_NODE_DEFAULT_MEASURED = { width: 420, height: 560 };

function isNoReferenceNode(node: CanvasNode): boolean {
  const data = node.data as {
    label?: unknown;
    displayName?: unknown;
    content?: unknown;
    prompt?: unknown;
    reference_target?: unknown;
    __freezone_source?: unknown;
  };
  if (
    data.label === '__NO_CHARACTER__'
    || data.label === '__NO_PROP__'
    || data.displayName === '__NO_CHARACTER__'
    || data.displayName === '__NO_PROP__'
    || data.content === '__NO_CHARACTER__'
    || data.content === '__NO_PROP__'
    || data.prompt === '__NO_CHARACTER__'
    || data.prompt === '__NO_PROP__'
  ) {
    return true;
  }
  const referenceTarget =
    data.reference_target
    && typeof data.reference_target === 'object'
    && !Array.isArray(data.reference_target)
      ? (data.reference_target as Record<string, unknown>)
      : null;
  if (
    referenceTarget?.identity_id === '__NO_CHARACTER__'
    || referenceTarget?.prop_id === '__NO_PROP__'
  ) {
    return true;
  }
  const freezoneSource =
    data.__freezone_source
    && typeof data.__freezone_source === 'object'
    && !Array.isArray(data.__freezone_source)
      ? (data.__freezone_source as Record<string, unknown>)
      : null;
  const meta =
    freezoneSource?.meta
    && typeof freezoneSource.meta === 'object'
    && !Array.isArray(freezoneSource.meta)
      ? (freezoneSource.meta as Record<string, unknown>)
      : null;
  return meta?.identity_id === '__NO_CHARACTER__' || meta?.prop_id === '__NO_PROP__';
}

function nodeHydratePriority(node: CanvasNode): number {
  const data = node.data && typeof node.data === 'object' && !Array.isArray(node.data)
    ? (node.data as Record<string, unknown>)
    : {};
  if (
    data.preset_managed === true
    || data.projection_archived === true
    || (typeof data.projection_key === 'string' && data.projection_key.trim())
  ) {
    return 2;
  }
  return 1;
}

function dedupeNodesById(nodes: CanvasNode[]): CanvasNode[] {
  const order: string[] = [];
  const indexById = new Map<string, number>();
  const deduped: CanvasNode[] = [];
  for (const node of nodes) {
    const existingIndex = indexById.get(node.id);
    if (existingIndex === undefined) {
      indexById.set(node.id, deduped.length);
      order.push(node.id);
      deduped.push(node);
      continue;
    }
    const existing = deduped[existingIndex];
    if (nodeHydratePriority(node) >= nodeHydratePriority(existing)) {
      deduped[existingIndex] = node;
    }
  }
  return order.map((id) => deduped[indexById.get(id)!]);
}

function detachMissingParents(nodes: CanvasNode[]): CanvasNode[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  return nodes.map((node) => {
    if (!node.parentId || nodeIds.has(node.parentId)) {
      return node;
    }
    return {
      ...node,
      parentId: undefined,
      extent: undefined,
    };
  });
}

function sortParentNodesBeforeChildren(nodes: CanvasNode[]): CanvasNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const originalIndex = new Map(nodes.map((node, index) => [node.id, index] as const));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const sorted: CanvasNode[] = [];

  const visit = (node: CanvasNode) => {
    if (visited.has(node.id)) return;
    if (visiting.has(node.id)) {
      sorted.push(node);
      visited.add(node.id);
      return;
    }
    visiting.add(node.id);
    if (node.parentId) {
      const parent = nodeById.get(node.parentId);
      if (parent) {
        visit(parent);
      }
    }
    visiting.delete(node.id);
    if (!visited.has(node.id)) {
      sorted.push(node);
      visited.add(node.id);
    }
  };

  for (const node of [...nodes].sort(
    (left, right) =>
      (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0),
  )) {
    visit(node);
  }
  return sorted;
}

export function normalizeCanvasNodes(
  rawNodes: CanvasNode[],
  nodeDefaultDataGateway?: CanvasNodeDefaultDataGateway,
): CanvasNode[] {
  const normalizedNodes = rawNodes
    .map((node) => {
      if (!Object.values(CANVAS_NODE_TYPES).includes(node.type as CanvasNodeType)) {
        return null;
      }

      const mergedData = {
        ...createCanvasNodeDefaultData(
          node.type as CanvasNodeType,
          nodeCatalog,
          nodeDefaultDataGateway,
        ),
        ...(node.data as Partial<CanvasNodeData>),
      } as CanvasNodeData;

      if (node.type === CANVAS_NODE_TYPES.storyboardSplit) {
        const frames = (mergedData as { frames?: StoryboardFrameItem[] }).frames ?? [];
        const firstFrameAspectRatio = frames.find(
          (frame) => typeof frame.aspectRatio === 'string',
        )?.aspectRatio;
        const normalizedFrameAspectRatio =
          (typeof (mergedData as { frameAspectRatio?: unknown }).frameAspectRatio === 'string'
            ? (mergedData as { frameAspectRatio?: string }).frameAspectRatio
            : null)
          ?? firstFrameAspectRatio
          ?? DEFAULT_ASPECT_RATIO;

        (mergedData as { frameAspectRatio: string }).frameAspectRatio = normalizedFrameAspectRatio;
        (mergedData as { frames: StoryboardFrameItem[] }).frames = frames.map((frame, index) => ({
          id: frame.id,
          imageUrl: frame.imageUrl ?? null,
          previewImageUrl: frame.previewImageUrl ?? null,
          aspectRatio:
            typeof frame.aspectRatio === 'string'
              ? frame.aspectRatio
              : normalizedFrameAspectRatio,
          note: frame.note ?? '',
          order: Number.isFinite(frame.order) ? frame.order : index,
        }));

        const rawExportOptions = (mergedData as {
          exportOptions?: Partial<StoryboardExportOptions>;
        }).exportOptions;
        const defaultExportOptions = createDefaultStoryboardExportOptions();
        const rawFontSize = Number.isFinite(rawExportOptions?.fontSize)
          ? Number(rawExportOptions?.fontSize)
          : defaultExportOptions.fontSize;
        const normalizedFontSize = rawFontSize > 20
          ? Math.round(rawFontSize / 6)
          : rawFontSize;
        (mergedData as { exportOptions: StoryboardExportOptions }).exportOptions = {
          ...defaultExportOptions,
          ...(rawExportOptions ?? {}),
          fontSize: Math.max(1, Math.min(20, Math.round(normalizedFontSize))),
        };
      }

      if ('aspectRatio' in mergedData && !mergedData.aspectRatio) {
        mergedData.aspectRatio = DEFAULT_ASPECT_RATIO;
      }

      // Interrupted generation is recoverable only when a persisted task handle exists.
      if ('isGenerating' in mergedData && mergedData.isGenerating) {
        const generationJobId =
          typeof (mergedData as { generationJobId?: unknown }).generationJobId === 'string'
            ? (mergedData as { generationJobId?: string }).generationJobId?.trim() ?? ''
            : '';
        const generationTaskKey =
          typeof (mergedData as { generationTaskKey?: unknown }).generationTaskKey === 'string'
            ? (mergedData as { generationTaskKey?: string }).generationTaskKey?.trim() ?? ''
            : '';
        const skillRunId =
          typeof (mergedData as { skillRunId?: unknown }).skillRunId === 'string'
            ? (mergedData as { skillRunId?: string }).skillRunId?.trim() ?? ''
            : '';
        if (!generationJobId && !generationTaskKey && !skillRunId) {
          mergedData.isGenerating = false;
          if ('generationStartedAt' in mergedData) {
            mergedData.generationStartedAt = null;
          }
        }
      }

      const normalizedNode = {
        ...node,
        type: node.type as CanvasNodeType,
        data: mergedData,
      } as CanvasNode;

      if (node.type === CANVAS_NODE_TYPES.skill && !node.measured) {
        normalizedNode.measured = SKILL_NODE_DEFAULT_MEASURED;
      } else if (node.type === CANVAS_NODE_TYPES.beatContext && !node.measured) {
        normalizedNode.measured = BEAT_CONTEXT_NODE_DEFAULT_MEASURED;
      }

      return isNoReferenceNode(normalizedNode) ? null : normalizedNode;
    })
    .filter((node): node is CanvasNode => Boolean(node));

  return sortParentNodesBeforeChildren(
    detachMissingParents(dedupeNodesById(normalizedNodes)),
  );
}
