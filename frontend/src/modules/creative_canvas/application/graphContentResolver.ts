// Copyright (c) 2026 AI anime
export interface UpstreamGraphNode {
  id: string;
  type?: string | null;
  data: Record<string, unknown>;
}

export interface UpstreamGraphEdge {
  source: string;
  target: string;
}

/**
 * 单条「上游节点内容」记录。所有可能字段都是可选的，调用方按需取用。
 * `text` 来自任何带 prompt / content 的上游节点，`imageUrl` / `videoUrl` /
 * `audioUrl` 来自素材类节点。
 */
export interface UpstreamContent {
  nodeId: string;
  nodeType: string;
  displayName?: string;
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
}

function nonEmpty(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.length > 0 ? value : undefined;
}

/**
 * Pure projection of a single node into its {@link UpstreamContent}. Exported so
 * the per-node subscription hook (`useUpstreamContents`) can map a shallow-
 * selected slice of upstream nodes without re-walking the whole graph.
 */
export function extractUpstreamContent(node: UpstreamGraphNode): UpstreamContent {
  const data = node.data ?? {};
  const displayNameRaw = data.displayName;
  const base: UpstreamContent = {
    nodeId: node.id,
    nodeType: node.type ?? "",
    displayName:
      typeof displayNameRaw === "string" && displayNameRaw.length > 0
        ? displayNameRaw
        : undefined,
  };

  if (node.type === "textAnnotationNode") {
    return { ...base, text: nonEmpty(data.content as string | null | undefined) };
  }
  if (node.type === "uploadNode" || node.type === "exportImageNode") {
    return {
      ...base,
      imageUrl:
        nonEmpty(data.imageUrl as string | null | undefined) ??
        nonEmpty(data.previewImageUrl as string | null | undefined),
    };
  }
  if (node.type === "imageNode" || node.type === "imageGenNode") {
    const referenceImageUrl =
      node.type === "imageGenNode"
        ? nonEmpty(data.referenceImageUrl as string | null | undefined)
        : undefined;
    return {
      ...base,
      imageUrl:
        nonEmpty(data.imageUrl as string | null | undefined) ??
        nonEmpty(data.previewImageUrl as string | null | undefined) ??
        referenceImageUrl,
    };
  }
  if (node.type === "storyboardGenNode") {
    return {
      ...base,
      imageUrl:
        nonEmpty(data.imageUrl as string | null | undefined) ??
        nonEmpty(data.previewImageUrl as string | null | undefined),
    };
  }
  if (node.type === "videoNode") {
    return {
      ...base,
      videoUrl: nonEmpty(data.videoUrl as string | null | undefined),
    };
  }
  if (node.type === "audioNode") {
    return { ...base, audioUrl: nonEmpty(data.audioUrl as string | null | undefined) };
  }
  if (node.type === "scriptNode") {
    const promptRaw = data.prompt;
    return {
      ...base,
      text: typeof promptRaw === "string" ? nonEmpty(promptRaw) : undefined,
    };
  }
  return base;
}

/**
 * 把上游所有 `text` 字段拼成单段 prompt 上下文，按出现顺序，空段过滤。
 * 调用方一般会把它前置到自己的 prompt 之前再发请求。
 */
export function joinUpstreamText(contents: UpstreamContent[]): string {
  return contents
    .map((content) => (typeof content.text === "string" ? content.text.trim() : ""))
    .filter((text) => text.length > 0)
    .join("\n\n");
}

/**
 * 收集所有上游节点可作为「素材引用」的 URL — 图片和视频。
 * 后端 `reference_urls` 接受同一个数组里混合 image / video。
 * audio 不收（生图节点用不到）。
 *
 * 返回顺序：先所有 imageUrl，再所有 videoUrl，按上游节点连接顺序；
 * 自带去重，避免同一 URL 被多个 resolver 重复送进去。
 */
export function collectUpstreamReferenceUrls(contents: UpstreamContent[]): string[] {
  const out: string[] = [];
  for (const content of contents) {
    if (typeof content.imageUrl === "string" && content.imageUrl.length > 0) {
      out.push(content.imageUrl);
    }
  }
  for (const content of contents) {
    if (typeof content.videoUrl === "string" && content.videoUrl.length > 0) {
      out.push(content.videoUrl);
    }
  }
  return Array.from(new Set(out));
}
