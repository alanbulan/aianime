// Copyright (c) 2026 AI anime
import {
  SKILL_SCHEMA_VERSION,
  type SkillDefinition,
} from '@/features/freezone/public';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type CanvasNodeData,
  type CanvasNodeType,
} from '../domain/canvasNodes';

export interface CanvasNodeMenuConnectionOrigin {
  nodeId: string;
  handleType: 'source' | 'target';
}

export interface CanvasNodeMenuSelectionPlan {
  kind: 'placement' | 'spawn';
  initialData?: Partial<CanvasNodeData>;
}

export function planCanvasNodeMenuSelection({
  type,
  nodes,
  pendingConnection,
  hasPendingBatchConnection,
  hasAllowedTypeFilter,
}: {
  type: CanvasNodeType;
  nodes: readonly CanvasNode[];
  pendingConnection: CanvasNodeMenuConnectionOrigin | null;
  hasPendingBatchConnection: boolean;
  hasAllowedTypeFilter: boolean;
}): CanvasNodeMenuSelectionPlan {
  let initialData: Partial<CanvasNodeData> | undefined;
  if (pendingConnection && type === CANVAS_NODE_TYPES.imageEdit) {
    initialData = {
      generationMode: 'image_reference',
      requestAspectRatio: 'auto',
    };
  } else if (
    pendingConnection?.handleType === 'target'
    && type === CANVAS_NODE_TYPES.upload
  ) {
    const originNode = nodes.find((node) => node.id === pendingConnection.nodeId);
    if (originNode?.type === CANVAS_NODE_TYPES.imageGen) {
      initialData = { imageOnly: true };
    }
  }

  return {
    kind: !pendingConnection
      && !hasPendingBatchConnection
      && !hasAllowedTypeFilter
      ? 'placement'
      : 'spawn',
    initialData,
  };
}

export function createCanvasSkillNodeData(
  skill: SkillDefinition,
): Partial<CanvasNodeData> {
  return {
    skill_id: skill.id,
    skill_schema_version: skill.schema_version ?? SKILL_SCHEMA_VERSION,
    displayName: skill.display_name,
  } as Partial<CanvasNodeData>;
}
