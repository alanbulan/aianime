// Copyright (c) 2026 AI anime
export type StoryboardCellKind = 'image' | 'video' | 'audio' | 'script' | 'empty';

export interface StoryboardCellPreview {
  nodeId: string;
  kind: StoryboardCellKind;
  /** Resolved thumbnail URL (image, or a video poster). Null → render a placeholder. */
  imageUrl: string | null;
  label: string;
}

export interface StoryboardCellPreviewNode {
  id: string;
  type?: string;
  data?: unknown;
}

export interface StoryboardCellPreviewTypeCatalog {
  video: readonly string[];
  storyboard: readonly string[];
  audio: readonly string[];
  script: readonly string[];
  image: readonly string[];
}

export interface StoryboardCellPreviewPorts<
  TNode extends StoryboardCellPreviewNode,
> {
  types: StoryboardCellPreviewTypeCatalog;
  resolveSourceImageUrl: (node: TNode) => string | null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function firstStr(...values: unknown[]): string | null {
  for (const value of values) {
    const resolved = str(value);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

// Display-safe resolver (identity for data:/blob:/http, passes /static through).
// Deliberately NOT resolveMediaUrl — that rejects data:/blob: URLs (a security
// rule for href/navigation), which would blank out freshly-uploaded local images.
function displayUrl(raw: string | null): string | null {
  return raw;
}

/**
 * Derive a compact thumbnail for one storyboard-board cell from its member node.
 * Mirrors the media fields used by `extractCanvasAssets`; non-media nodes fall
 * back to a kind placeholder so empty cells read like the libtv reference.
 */
export function getStoryboardCellPreview<
  TNode extends StoryboardCellPreviewNode,
>(
  node: TNode,
  ports: StoryboardCellPreviewPorts<TNode>,
): StoryboardCellPreview {
  const data =
    node.data && typeof node.data === 'object'
      ? (node.data as Record<string, unknown>)
      : {};
  const label =
    firstStr((data as { displayName?: unknown }).displayName, (data as { label?: unknown }).label) ??
    '';

  // Type-specific kinds first (so video keeps its play badge, etc.).
  if (node.type && ports.types.video.includes(node.type)) {
    return {
      nodeId: node.id,
      kind: 'video',
      imageUrl: displayUrl(str(data.previewImageUrl)),
      label,
    };
  }
  if (node.type && ports.types.storyboard.includes(node.type)) {
    const frames = Array.isArray(data.frames) ? data.frames : [];
    const firstFrame =
      frames.length > 0 ? (frames[0] as Record<string, unknown>) : null;
    return {
      nodeId: node.id,
      kind: 'image',
      imageUrl: firstFrame
        ? displayUrl(firstStr(firstFrame.imageUrl, firstFrame.previewImageUrl))
        : null,
      label,
    };
  }
  if (node.type && ports.types.audio.includes(node.type)) {
    return { nodeId: node.id, kind: 'audio', imageUrl: null, label };
  }
  if (node.type && ports.types.script.includes(node.type)) {
    return { nodeId: node.id, kind: 'script', imageUrl: null, label };
  }

  // Everything else: resolve the node's current image. Prefer the unified
  // resolver (upload / imageEdit / exportImage / imageGen incl. referenceImageUrl),
  // then a broad field sweep so any image-bearing node still renders a thumbnail.
  const sourceImage =
    ports.resolveSourceImageUrl(node) ??
    firstStr(
      data.imageUrl,
      data.previewImageUrl,
      data.referenceImageUrl,
      data.committed_slot_url,
      data.committedSlotUrl
    );
  if (sourceImage) {
    return { nodeId: node.id, kind: 'image', imageUrl: displayUrl(sourceImage), label };
  }

  // Image-kind node with nothing resolvable yet → image placeholder; else empty.
  const isImageKind = Boolean(
    node.type && ports.types.image.includes(node.type),
  );
  return { nodeId: node.id, kind: isImageKind ? 'image' : 'empty', imageUrl: null, label };
}
