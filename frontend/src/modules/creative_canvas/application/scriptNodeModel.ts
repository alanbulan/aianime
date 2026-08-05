// Copyright (c) 2026 AI anime
import {
  isCanvasStoryScriptResult,
  type CanvasStoryScriptReference,
  type CanvasStoryScriptResult,
} from "./generateCanvasStoryScript";

export type ScriptGenAction = "fromScript" | "fromVideoRef" | "fromCharacter";

export interface ScriptGraphNode {
  id: string;
  type?: string | null;
  position: { x?: number; y?: number } | null;
  data: Record<string, unknown>;
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface ScriptGraphEdge {
  id?: string;
  source: string;
  target: string;
  [key: string]: unknown;
}

export interface ScriptNodeModelData {
  prompt?: unknown;
  [key: string]: unknown;
}

export const SCRIPT_NODE_SIZE_LIMITS = {
  minWidth: 360,
  minHeight: 240,
  maxWidth: 1600,
  maxHeight: 1200,
} as const;

export interface ScriptNodeAction {
  key: ScriptGenAction;
  label: string;
}

export const SCRIPT_NODE_ACTIONS: readonly ScriptNodeAction[] = [
  { key: "fromScript", label: "剧本生成分镜脚本" },
  { key: "fromVideoRef", label: "视频参考生成分镜脚本" },
  { key: "fromCharacter", label: "角色生成分镜脚本" },
];

export interface ScriptNodeSpawnItem {
  type: "textAnnotationNode" | "videoNode" | "uploadNode";
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface ScriptNodeSpawnPlan {
  groupLabel: string;
  items: ScriptNodeSpawnItem[];
}

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 320;
const DEFAULT_WIDTH_WITH_RESULT = 800;
const DEFAULT_HEIGHT_WITH_RESULT = 400;
const SPAWN_TEXT_WIDTH = 440;
const SPAWN_TEXT_HEIGHT = 320;
const SPAWN_VIDEO_WIDTH = 580;
const SPAWN_VIDEO_HEIGHT = 380;
const SPAWN_UPLOAD_WIDTH = 320;
const SPAWN_UPLOAD_HEIGHT = 350;
const SPAWN_GAP_X = 40;
const SPAWN_GAP_Y = 24;

export function classifyCanvasStoryScriptReference(
  node: ScriptGraphNode,
): CanvasStoryScriptReference | null {
  const data = node.data ?? {};
  const displayName =
    typeof data.displayName === "string" && data.displayName.length > 0
      ? data.displayName
      : null;
  if (node.type === "textAnnotationNode") {
    return {
      nodeId: node.id,
      kind: "text",
      text: typeof data.content === "string" ? data.content : "",
      displayName,
    };
  }
  if (node.type === "videoNode") {
    const videoUrl =
      typeof data.videoUrl === "string" && data.videoUrl.length > 0
        ? data.videoUrl
        : null;
    const thumbUrl =
      (typeof data.previewImageUrl === "string" &&
        data.previewImageUrl) ||
      null;
    const durationSec =
      typeof data.durationMs === "number" && data.durationMs > 0
        ? data.durationMs / 1000
        : null;
    return {
      nodeId: node.id,
      kind: "video",
      thumbUrl,
      videoUrl,
      durationSec,
      displayName,
    };
  }
  if (node.type === "audioNode") {
    return {
      nodeId: node.id,
      kind: "audio",
      displayName,
    };
  }
  if (node.type === "imageGenNode") {
    const referenceImageUrl =
      typeof data.referenceImageUrl === "string" &&
      data.referenceImageUrl.length > 0
        ? data.referenceImageUrl
        : null;
    return {
      nodeId: node.id,
      kind: "image",
      thumbUrl:
        (typeof data.previewImageUrl === "string" && data.previewImageUrl) ||
        (typeof data.imageUrl === "string" && data.imageUrl) ||
        referenceImageUrl,
      displayName,
    };
  }
  if (
    node.type === "uploadNode" ||
    node.type === "imageNode" ||
    node.type === "exportImageNode"
  ) {
    return {
      nodeId: node.id,
      kind: "image",
      thumbUrl:
        (typeof data.previewImageUrl === "string" && data.previewImageUrl) ||
        (typeof data.imageUrl === "string" && data.imageUrl) ||
        null,
      displayName,
    };
  }
  return null;
}

export function resolveScriptNodeSize(
  hasResult: boolean,
  width?: number,
  height?: number,
) {
  const fallbackWidth = hasResult ? DEFAULT_WIDTH_WITH_RESULT : DEFAULT_WIDTH;
  const fallbackHeight = hasResult ? DEFAULT_HEIGHT_WITH_RESULT : DEFAULT_HEIGHT;
  return {
    width: Math.max(
      SCRIPT_NODE_SIZE_LIMITS.minWidth,
      Math.round(width ?? fallbackWidth),
    ),
    height: Math.max(
      SCRIPT_NODE_SIZE_LIMITS.minHeight,
      Math.round(height ?? fallbackHeight),
    ),
  };
}

export function resolveScriptNodeResult(
  value: unknown,
): CanvasStoryScriptResult | null {
  return isCanvasStoryScriptResult(value) ? value : null;
}

export function updateScriptResultCell(
  result: CanvasStoryScriptResult,
  rowIndex: number,
  columnKey: string,
  nextValue: string,
): CanvasStoryScriptResult | null {
  const existing = result.rows[rowIndex];
  if (!existing) return null;
  const previousRaw = existing[columnKey];
  const previous =
    typeof previousRaw === "string"
      ? previousRaw
      : previousRaw == null
        ? ""
        : String(previousRaw);
  if (previous === nextValue) return null;

  return {
    ...result,
    rows: result.rows.map((row, index) =>
      index === rowIndex ? { ...row, [columnKey]: nextValue } : row,
    ),
  };
}

export function resolveScriptNodeReferences(
  upstreamNodes: readonly ScriptGraphNode[],
): CanvasStoryScriptReference[] {
  return [...upstreamNodes]
    .sort((left, right) =>
      (left.position?.y ?? 0) - (right.position?.y ?? 0),
    )
    .map((node) => classifyCanvasStoryScriptReference(node))
    .filter(
      (reference): reference is CanvasStoryScriptReference =>
        reference !== null,
    );
}

export function scriptPromptHasContent(data: ScriptNodeModelData): boolean {
  return typeof data.prompt === "string" && data.prompt.trim().length > 0;
}

export function hasScriptGenerationSource(
  prompt: string,
  references: readonly CanvasStoryScriptReference[],
): boolean {
  return (
    prompt.trim().length > 0 ||
    references.some(
      (reference) =>
        (reference.kind === "text" &&
          (reference.text ?? "").trim().length > 0) ||
        (reference.kind === "video" && Boolean(reference.videoUrl)) ||
        (reference.kind === "image" && Boolean(reference.thumbUrl)),
    )
  );
}

export function hasScriptReferencePreview(
  reference: CanvasStoryScriptReference,
): boolean {
  return (
    (reference.kind === "image" && Boolean(reference.thumbUrl)) ||
    (reference.kind === "video" &&
      Boolean(reference.videoUrl || reference.thumbUrl))
  );
}

function nodeSize(
  node: ScriptGraphNode,
  fallbackWidth: number,
  fallbackHeight: number,
) {
  return {
    width:
      node.measured?.width ??
      (typeof node.width === "number" ? node.width : fallbackWidth),
    height:
      node.measured?.height ??
      (typeof node.height === "number" ? node.height : fallbackHeight),
  };
}

function overlaps(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  const margin = 12;
  return (
    left.x < right.x + right.width + margin &&
    left.x + left.width + margin > right.x &&
    left.y < right.y + right.height + margin &&
    left.y + left.height + margin > right.y
  );
}

export function resolveScriptNodeSpawnPlan({
  action,
  self,
  nodes,
  edges,
  fallbackHeight,
}: {
  action: ScriptGenAction;
  self: ScriptGraphNode;
  nodes: readonly ScriptGraphNode[];
  edges: readonly ScriptGraphEdge[];
  fallbackHeight: number;
}): ScriptNodeSpawnPlan {
  const actionDefinition = SCRIPT_NODE_ACTIONS.find(
    (candidate) => candidate.key === action,
  );
  const groupLabel = `${actionDefinition?.label ?? ""}组`;
  const selfHeight = self.height ?? fallbackHeight;
  const centerY = (self.position?.y ?? 0) + selfHeight / 2;

  if (action === "fromScript") {
    return {
      groupLabel,
      items: [
        {
          type: "textAnnotationNode",
          position: {
            x: (self.position?.x ?? 0) - SPAWN_TEXT_WIDTH - SPAWN_GAP_X,
            y: centerY - SPAWN_TEXT_HEIGHT / 2,
          },
          data: { referenceOnly: true, displayName: "剧本" },
        },
      ],
    };
  }

  if (action === "fromVideoRef") {
    return {
      groupLabel,
      items: [
        {
          type: "videoNode",
          position: {
            x: (self.position?.x ?? 0) - SPAWN_VIDEO_WIDTH - SPAWN_GAP_X,
            y: centerY - SPAWN_VIDEO_HEIGHT / 2,
          },
          data: { referenceOnly: true },
        },
      ],
    };
  }

  const baseX = (self.position?.x ?? 0) - SPAWN_UPLOAD_WIDTH - SPAWN_GAP_X;
  const seeds = [{ displayName: "角色 1" }, { displayName: "角色 2" }];
  const stepY = SPAWN_UPLOAD_HEIGHT + SPAWN_GAP_Y;
  const totalHeight =
    SPAWN_UPLOAD_HEIGHT * seeds.length + SPAWN_GAP_Y * (seeds.length - 1);
  const preferredStartY = (self.position?.y ?? 0) + (selfHeight - totalHeight) / 2;
  const upstreamIds = new Set(
    edges.filter((edge) => edge.target === self.id).map((edge) => edge.source),
  );
  const lastColumnY = nodes
    .filter(
      (node) =>
        upstreamIds.has(node.id) &&
        node.type === "uploadNode" &&
        Math.abs((node.position?.x ?? 0) - baseX) < 8,
    )
    .reduce<number | null>(
      (maximum, node) =>
        maximum === null
          ? (node.position?.y ?? 0)
          : Math.max(maximum, node.position?.y ?? 0),
      null,
    );
  let y =
    lastColumnY === null
      ? preferredStartY
      : Math.max(preferredStartY, lastColumnY + stepY);
  const occupiedRects = nodes
    .filter((node) => node.id !== self.id)
    .map((node) => {
      const size = nodeSize(node, SPAWN_UPLOAD_WIDTH, SPAWN_UPLOAD_HEIGHT);
      return {
        x: node.position?.x ?? 0,
        y: node.position?.y ?? 0,
        width: size.width,
        height: size.height,
      };
    });
  const items = seeds.map((seed) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const candidate = {
        x: baseX,
        y,
        width: SPAWN_UPLOAD_WIDTH,
        height: SPAWN_UPLOAD_HEIGHT,
      };
      if (!occupiedRects.some((rect) => overlaps(candidate, rect))) break;
      y += stepY;
    }
    occupiedRects.push({
      x: baseX,
      y,
      width: SPAWN_UPLOAD_WIDTH,
      height: SPAWN_UPLOAD_HEIGHT,
    });
    const item: ScriptNodeSpawnItem = {
      type: "uploadNode",
      position: { x: baseX, y },
      data: seed,
    };
    y += stepY;
    return item;
  });

  return { groupLabel, items };
}
