// Copyright (c) 2026 AI anime
import type {
  CanvasNodeType,
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
} from '@/features/canvas/domain/canvasNodes';
import type {
  CanvasAssetGateway,
  CanvasGraphGateway,
} from '@/features/canvas/application/ports';
import { CANVAS_NODE_TYPES } from '@/features/canvas/domain/canvasNodes';

export type SelectedBackgroundTarget = {
  episode: number | string;
  beat: number | string;
};

export type StageSelectedBackgroundOptions = {
  sourceSkillNodeId: string;
  label?: string;
  extraData?: Partial<CanvasNodeData> & Record<string, unknown>;
};

type StageSelectedBackgroundCandidateOptions = {
  sourceNodeId: string;
  label?: string;
};

export type UploadSelectedBackgroundCandidateOptions = StageSelectedBackgroundCandidateOptions & {
  successMessage?: string;
};

export type CanvasCommitRequestPublisher = (request: {
  nodeId: string;
  auto?: boolean;
  successMessage?: string;
}) => void;

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function edgeOutputRole(edge: CanvasEdge): string | null {
  const handleRole = typeof edge.sourceHandle === 'string' ? edge.sourceHandle.trim() : '';
  if (handleRole) return handleRole;
  const dataRole = (edge.data as { role?: unknown } | undefined)?.role;
  return typeof dataRole === 'string' && dataRole.trim() ? dataRole.trim() : null;
}

function selectedBackgroundOutputPatchForNode(
  node: CanvasNode,
  imageUrl: string,
  target: SelectedBackgroundTarget,
  options: StageSelectedBackgroundOptions,
): Partial<CanvasNodeData> {
  const nodeData = recordValue(node.data) ?? {};
  const fallbackLabel = options.label
    ?? '当前背景';
  const displayName =
    typeof nodeData.displayName === 'string' && nodeData.displayName.trim()
      ? nodeData.displayName
      : fallbackLabel;
  return {
    displayName,
    imageUrl,
    previewImageUrl: imageUrl,
    aspectRatio: '16:9',
    user_spawned: true,
    preset_managed: false,
    committed_at: null,
    committed_slot_url: null,
    slot_target: {
      kind: 'selected_background',
      episode: Number(target.episode),
      beat: Number(target.beat),
    },
    candidate_origin: {
      skill_id: 'freezone.set_selected_background',
      skill_node_id: options.sourceSkillNodeId,
    },
    output_role: 'selected_background',
    media_kind: 'image',
    ...(options.extraData ?? {}),
  } as Partial<CanvasNodeData>;
}

function selectedBackgroundCandidatePosition(sourceNode: CanvasNode): { x: number; y: number } {
  return {
    x: sourceNode.position.x + 460,
    y: sourceNode.position.y + 40,
  };
}

export function stageSelectedBackgroundOutputForSkill(
  graphGateway: CanvasGraphGateway,
  target: SelectedBackgroundTarget,
  imageUrl: string,
  options: StageSelectedBackgroundOptions,
): string | null {
  const state = graphGateway.getSnapshot();
  const outputEdge = state.edges.find(
    (edge) =>
      edge.source === options.sourceSkillNodeId &&
      edgeOutputRole(edge) === 'selected_background',
  );
  const outputNode = outputEdge
    ? state.nodes.find((node) => node.id === outputEdge.target)
    : undefined;

  if (outputNode) {
    graphGateway.updateNodeData(
      outputNode.id,
      selectedBackgroundOutputPatchForNode(outputNode, imageUrl, target, options),
    );
    return outputNode.id;
  }

  const sourceNode = state.nodes.find((node) => node.id === options.sourceSkillNodeId);
  if (!sourceNode) {
    return null;
  }

  const nodeType: CanvasNodeType = CANVAS_NODE_TYPES.imageGen;
  const nodeId = graphGateway.addNode(
    nodeType,
    selectedBackgroundCandidatePosition(sourceNode),
    {
      ...selectedBackgroundOutputPatchForNode(
        {
          ...sourceNode,
          id: `${options.sourceSkillNodeId}-selected-background-output`,
          type: nodeType,
          data: {},
        } as CanvasNode,
        imageUrl,
        target,
        options,
      ),
    } as Partial<CanvasNodeData>,
  );
  if (!nodeId) {
    return null;
  }
  graphGateway.addEdgeWithData(
    options.sourceSkillNodeId,
    nodeId,
    {
      edgeKind: 'mainline_data',
      propagates: true,
      role: 'selected_background',
      label: '当前背景',
    },
    {
      id: `edge_${options.sourceSkillNodeId}_to_${nodeId}_selected_background`,
      sourceHandle: 'selected_background',
      targetHandle: 'target',
    },
  );
  return nodeId;
}

function stageSelectedBackgroundCandidateFromNode(
  graphGateway: CanvasGraphGateway,
  target: SelectedBackgroundTarget,
  imageUrl: string,
  options: StageSelectedBackgroundCandidateOptions,
): string | null {
  const state = graphGateway.getSnapshot();
  const sourceNode = state.nodes.find((node) => node.id === options.sourceNodeId);
  if (!sourceNode) {
    return null;
  }

  const nodeType: CanvasNodeType = CANVAS_NODE_TYPES.imageGen;
  const nodeId = graphGateway.addNode(
    nodeType,
    selectedBackgroundCandidatePosition(sourceNode),
    selectedBackgroundOutputPatchForNode(
      {
        ...sourceNode,
        id: `${options.sourceNodeId}-selected-background-candidate`,
        type: nodeType,
        data: {},
      } as CanvasNode,
      imageUrl,
      target,
      {
        sourceSkillNodeId: options.sourceNodeId,
        label: options.label,
      },
    ) as Partial<CanvasNodeData>,
  );
  if (!nodeId) {
    return null;
  }
  graphGateway.addEdgeWithData(
    options.sourceNodeId,
    nodeId,
    {
      edgeKind: 'mainline_data',
      propagates: true,
      role: 'selected_background',
      label: '当前背景候选',
    },
    {
      id: `edge_${options.sourceNodeId}_to_${nodeId}_selected_background_candidate`,
      sourceHandle: 'source',
      targetHandle: 'target',
    },
  );
  return nodeId;
}

export async function uploadAndAutoCommitSelectedBackgroundCandidate(
  assetGateway: CanvasAssetGateway,
  graphGateway: CanvasGraphGateway,
  publishCommitRequested: CanvasCommitRequestPublisher,
  projectId: string | null | undefined,
  target: SelectedBackgroundTarget,
  blob: Blob,
  filename: string,
  options: UploadSelectedBackgroundCandidateOptions,
): Promise<{ nodeId: string; url: string }> {
  if (!projectId) {
    throw new Error('缺少项目');
  }
  const uploaded = await assetGateway.upload(projectId, blob, filename, {
    disableTimeout: true,
  });
  const uploadedUrl = uploaded.url;
  const nodeId = stageSelectedBackgroundCandidateFromNode(
    graphGateway,
    target,
    uploadedUrl,
    options,
  );
  if (!nodeId) {
    throw new Error('无法创建当前背景候选节点');
  }
  publishCommitRequested({
    nodeId,
    auto: true,
    successMessage: options.successMessage
      ?? '已设置当前背景',
  });
  return { nodeId, url: uploadedUrl };
}
