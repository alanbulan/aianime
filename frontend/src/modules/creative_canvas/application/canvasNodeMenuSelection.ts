// Copyright (c) 2026 AI anime
import {
  SKILL_SCHEMA_VERSION,
  type SkillDefinition,
} from '@/modules/creative_canvas/domain/skillContract';

export interface CanvasNodeMenuConnectionOrigin {
  nodeId: string;
  handleType: 'source' | 'target';
}

export interface CanvasNodeMenuSelectionNode {
  id: string;
  type?: string;
}

export interface CanvasNodeMenuTypes<TNodeType extends string = string> {
  imageEdit: TNodeType;
  upload: TNodeType;
  imageGen: TNodeType;
  skill: TNodeType;
}

export interface CanvasImageReferenceNodeInitialData {
  generationMode: 'image_reference';
  requestAspectRatio: 'auto';
  [key: string]: unknown;
}

export interface CanvasImageOnlyNodeInitialData {
  imageOnly: true;
  [key: string]: unknown;
}

export type CanvasNodeMenuInitialData =
  | CanvasImageReferenceNodeInitialData
  | CanvasImageOnlyNodeInitialData;

export interface CanvasSkillNodeInitialData {
  skill_id: string;
  skill_schema_version: string;
  displayName: string;
  [key: string]: unknown;
}

export type CanvasNodeMenuCreationData =
  | CanvasNodeMenuInitialData
  | CanvasSkillNodeInitialData;

export interface CanvasNodeMenuSelectionPlan {
  kind: 'placement' | 'spawn';
  initialData?: CanvasNodeMenuInitialData;
}

export function planCanvasNodeMenuSelection({
  type,
  nodes,
  nodeTypes,
  pendingConnection,
  hasPendingBatchConnection,
  hasAllowedTypeFilter,
}: {
  type: string;
  nodes: readonly CanvasNodeMenuSelectionNode[];
  nodeTypes: CanvasNodeMenuTypes;
  pendingConnection: CanvasNodeMenuConnectionOrigin | null;
  hasPendingBatchConnection: boolean;
  hasAllowedTypeFilter: boolean;
}): CanvasNodeMenuSelectionPlan {
  let initialData: CanvasNodeMenuInitialData | undefined;
  if (pendingConnection && type === nodeTypes.imageEdit) {
    initialData = {
      generationMode: 'image_reference',
      requestAspectRatio: 'auto',
    };
  } else if (
    pendingConnection?.handleType === 'target'
    && type === nodeTypes.upload
  ) {
    const originNode = nodes.find((node) => node.id === pendingConnection.nodeId);
    if (originNode?.type === nodeTypes.imageGen) {
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
): CanvasSkillNodeInitialData {
  return {
    skill_id: skill.id,
    skill_schema_version: skill.schema_version ?? SKILL_SCHEMA_VERSION,
    displayName: skill.display_name,
  };
}
