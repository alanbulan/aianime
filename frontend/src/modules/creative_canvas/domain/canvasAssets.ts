// Copyright (c) 2026 AI anime
import type {
  CanvasAssetBuckets,
  CanvasAssetKind,
  CanvasMediaUrlResolver,
} from './canvasAsset';
import {
  CANVAS_CONNECTION_NODE_TYPES,
  type CanvasConnectionNodeType,
} from './canvasConnection';

export interface CanvasAssetExtractionNode {
  id: string;
  type: CanvasConnectionNodeType;
  data: unknown;
}

function asRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/** First non-empty string among the candidates. */
function firstStr(...values: unknown[]): string | null {
  for (const value of values) {
    const resolved = str(value);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

/**
 * Best-effort creation timestamp. Image nodes carry an ISO `committed_at`;
 * generative nodes keep a numeric `generationStartedAt`. Returns null when the
 * node has neither so the caller can bucket it under an "unknown date" group.
 */
function timestampOf(data: Record<string, unknown>): number | null {
  const committed = str(data.committed_at);
  if (committed) {
    const parsed = Date.parse(committed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  const started = data.generationStartedAt;
  if (typeof started === 'number' && Number.isFinite(started)) {
    return started;
  }
  return null;
}

function labelOf(data: Record<string, unknown>): string | null {
  return firstStr(data.displayName, data.sourceFileName);
}

/**
 * Pull every image / video / audio asset out of the live canvas nodes.
 *
 * The history panel reads straight from the in-memory canvas (no backend
 * round-trip): we walk each node, pick the media url that matches its kind, and
 * dedupe by resolved url so the same asset referenced twice shows once.
 */
export function extractCanvasAssets(
  nodes: readonly CanvasAssetExtractionNode[],
  resolveMediaUrl: CanvasMediaUrlResolver,
): CanvasAssetBuckets {
  const buckets: CanvasAssetBuckets = { image: [], video: [], audio: [], model: [] };
  const seen = new Set<string>();

  const push = (
    kind: CanvasAssetKind,
    rawUrl: string | null,
    options: { nodeId: string; previewUrl?: string | null; label: string | null; timestamp: number | null; suffix?: string },
  ) => {
    const url = resolveMediaUrl(rawUrl);
    if (!url || seen.has(url)) {
      return;
    }
    seen.add(url);
    buckets[kind].push({
      id: `${options.nodeId}:${options.suffix ?? ''}:${url}`,
      kind,
      url,
      previewUrl: resolveMediaUrl(options.previewUrl ?? null),
      nodeId: options.nodeId,
      label: options.label,
      timestamp: options.timestamp,
    });
  };

  for (const node of nodes) {
    const data = asRecord(node.data);
    const timestamp = timestampOf(data);
    const label = labelOf(data);

    switch (node.type) {
      case CANVAS_CONNECTION_NODE_TYPES.upload:
      case CANVAS_CONNECTION_NODE_TYPES.imageEdit:
      case CANVAS_CONNECTION_NODE_TYPES.imageGen:
      case CANVAS_CONNECTION_NODE_TYPES.exportImage: {
        push('image', firstStr(data.imageUrl, data.committed_slot_url, data.previewImageUrl), {
          nodeId: node.id,
          label,
          timestamp,
        });
        break;
      }
      case CANVAS_CONNECTION_NODE_TYPES.storyboardSplit:
      case CANVAS_CONNECTION_NODE_TYPES.storyboardGen: {
        const frames = Array.isArray(data.frames) ? data.frames : [];
        frames.forEach((frame, index) => {
          const frameData = asRecord(frame);
          push('image', firstStr(frameData.imageUrl, frameData.previewImageUrl), {
            nodeId: node.id,
            label,
            timestamp,
            suffix: `frame-${index}`,
          });
        });
        break;
      }
      case CANVAS_CONNECTION_NODE_TYPES.video:
      case CANVAS_CONNECTION_NODE_TYPES.videoStory: {
        push('video', firstStr(data.videoUrl, data.sourceVideoUrl), {
          nodeId: node.id,
          previewUrl: str(data.previewImageUrl),
          label,
          timestamp,
        });
        break;
      }
      case CANVAS_CONNECTION_NODE_TYPES.videoCompose: {
        push('video', firstStr(data.resultVideoUrl), {
          nodeId: node.id,
          previewUrl: str(data.previewImageUrl),
          label,
          timestamp,
        });
        break;
      }
      case CANVAS_CONNECTION_NODE_TYPES.audio: {
        push('audio', firstStr(data.audioUrl), {
          nodeId: node.id,
          label,
          timestamp,
        });
        break;
      }
      case CANVAS_CONNECTION_NODE_TYPES.threeDWorld: {
        // The world's "asset" is its 3GS package (plyUrl, preferred) or a 360
        // pano image. The cover image is what we actually show on the card.
        push('model', firstStr(data.plyUrl, data.panoUrl), {
          nodeId: node.id,
          previewUrl: str(data.previewImageUrl),
          label,
          timestamp,
        });
        break;
      }
      default:
        break;
    }
  }

  return buckets;
}
