// Copyright (c) 2026 AI anime
import type { CanvasToolAssetGateway } from "./uploadToolOutput";

export type SelectedBackgroundTarget = {
  episode: number | string;
  beat: number | string;
};

export type StageSelectedBackgroundOptions = {
  sourceSkillNodeId: string;
  label?: string;
  extraData?: Record<string, unknown>;
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

export interface SelectedBackgroundGraphNode {
  id: string;
  type?: string | null;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface SelectedBackgroundGraphEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  data?: unknown;
}

export interface SelectedBackgroundGraphSnapshot {
  nodes: readonly SelectedBackgroundGraphNode[];
  edges: readonly SelectedBackgroundGraphEdge[];
}

export interface SelectedBackgroundGraphGateway {
  getSnapshot: () => SelectedBackgroundGraphSnapshot;
  addNode: (
    type: string,
    position: { x: number; y: number },
    data?: Record<string, unknown>,
  ) => string | null;
  addEdgeWithData: (
    source: string,
    target: string,
    data: Record<string, unknown>,
    options?: {
      id?: string;
      sourceHandle?: string;
      targetHandle?: string;
    },
  ) => string | null;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
}

const SELECTED_BACKGROUND_NODE_TYPE = "imageGenNode";

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function edgeOutputRole(edge: SelectedBackgroundGraphEdge): string | null {
  const handleRole =
    typeof edge.sourceHandle === "string" ? edge.sourceHandle.trim() : "";
  if (handleRole) return handleRole;
  const dataRole = (edge.data as { role?: unknown } | undefined)?.role;
  return typeof dataRole === "string" && dataRole.trim() ? dataRole.trim() : null;
}

function selectedBackgroundOutputPatchForNode(
  node: SelectedBackgroundGraphNode,
  imageUrl: string,
  target: SelectedBackgroundTarget,
  options: StageSelectedBackgroundOptions,
): Record<string, unknown> {
  const nodeData = recordValue(node.data) ?? {};
  const fallbackLabel = options.label ?? "当前背景";
  const displayName =
    typeof nodeData.displayName === "string" && nodeData.displayName.trim()
      ? nodeData.displayName
      : fallbackLabel;
  return {
    displayName,
    imageUrl,
    previewImageUrl: imageUrl,
    aspectRatio: "16:9",
    user_spawned: true,
    preset_managed: false,
    committed_at: null,
    committed_slot_url: null,
    slot_target: {
      kind: "selected_background",
      episode: Number(target.episode),
      beat: Number(target.beat),
    },
    candidate_origin: {
      skill_id: "freezone.set_selected_background",
      skill_node_id: options.sourceSkillNodeId,
    },
    output_role: "selected_background",
    media_kind: "image",
    ...(options.extraData ?? {}),
  };
}

function selectedBackgroundCandidatePosition(
  sourceNode: SelectedBackgroundGraphNode,
): { x: number; y: number } {
  return {
    x: sourceNode.position.x + 460,
    y: sourceNode.position.y + 40,
  };
}

export function stageSelectedBackgroundOutputForSkill(
  graphGateway: SelectedBackgroundGraphGateway,
  target: SelectedBackgroundTarget,
  imageUrl: string,
  options: StageSelectedBackgroundOptions,
): string | null {
  const state = graphGateway.getSnapshot();
  const outputEdge = state.edges.find(
    (edge) =>
      edge.source === options.sourceSkillNodeId &&
      edgeOutputRole(edge) === "selected_background",
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

  const nodeId = graphGateway.addNode(
    SELECTED_BACKGROUND_NODE_TYPE,
    selectedBackgroundCandidatePosition(sourceNode),
    selectedBackgroundOutputPatchForNode(
      {
        ...sourceNode,
        id: `${options.sourceSkillNodeId}-selected-background-output`,
        type: SELECTED_BACKGROUND_NODE_TYPE,
        data: {},
      },
      imageUrl,
      target,
      options,
    ),
  );
  if (!nodeId) {
    return null;
  }
  graphGateway.addEdgeWithData(
    options.sourceSkillNodeId,
    nodeId,
    {
      edgeKind: "mainline_data",
      propagates: true,
      role: "selected_background",
      label: "当前背景",
    },
    {
      id: `edge_${options.sourceSkillNodeId}_to_${nodeId}_selected_background`,
      sourceHandle: "selected_background",
      targetHandle: "target",
    },
  );
  return nodeId;
}

function stageSelectedBackgroundCandidateFromNode(
  graphGateway: SelectedBackgroundGraphGateway,
  target: SelectedBackgroundTarget,
  imageUrl: string,
  options: StageSelectedBackgroundCandidateOptions,
): string | null {
  const state = graphGateway.getSnapshot();
  const sourceNode = state.nodes.find((node) => node.id === options.sourceNodeId);
  if (!sourceNode) {
    return null;
  }

  const nodeId = graphGateway.addNode(
    SELECTED_BACKGROUND_NODE_TYPE,
    selectedBackgroundCandidatePosition(sourceNode),
    selectedBackgroundOutputPatchForNode(
      {
        ...sourceNode,
        id: `${options.sourceNodeId}-selected-background-candidate`,
        type: SELECTED_BACKGROUND_NODE_TYPE,
        data: {},
      },
      imageUrl,
      target,
      {
        sourceSkillNodeId: options.sourceNodeId,
        label: options.label,
      },
    ),
  );
  if (!nodeId) {
    return null;
  }
  graphGateway.addEdgeWithData(
    options.sourceNodeId,
    nodeId,
    {
      edgeKind: "mainline_data",
      propagates: true,
      role: "selected_background",
      label: "当前背景候选",
    },
    {
      id: `edge_${options.sourceNodeId}_to_${nodeId}_selected_background_candidate`,
      sourceHandle: "source",
      targetHandle: "target",
    },
  );
  return nodeId;
}

export async function uploadAndAutoCommitSelectedBackgroundCandidate(
  assetGateway: CanvasToolAssetGateway,
  graphGateway: SelectedBackgroundGraphGateway,
  publishCommitRequested: CanvasCommitRequestPublisher,
  projectId: string | null | undefined,
  target: SelectedBackgroundTarget,
  blob: Blob,
  filename: string,
  options: UploadSelectedBackgroundCandidateOptions,
): Promise<{ nodeId: string; url: string }> {
  if (!projectId) {
    throw new Error("缺少项目");
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
    throw new Error("无法创建当前背景候选节点");
  }
  publishCommitRequested({
    nodeId,
    auto: true,
    successMessage: options.successMessage ?? "已设置当前背景",
  });
  return { nodeId, url: uploadedUrl };
}
