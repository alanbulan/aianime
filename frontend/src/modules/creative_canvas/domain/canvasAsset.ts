// Copyright (c) 2026 AI anime
export type CanvasAssetKind = 'image' | 'video' | 'audio' | 'model';

export interface CanvasAsset {
  /** Stable key, unique per (node, media URL). */
  id: string;
  kind: CanvasAssetKind;
  /** Resolved, render-safe media URL. */
  url: string;
  /** Poster or thumbnail for video and audio cards. */
  previewUrl: string | null;
  nodeId: string;
  /** Display name from the source node. */
  label: string | null;
  /** Prompt captured by generation history; absent for live Canvas assets. */
  prompt?: string | null;
  /** Original model registry ID used to restore historical generation state. */
  model?: string | null;
  /** Original generation mode used to restore historical generation state. */
  genMode?: string | null;
  /** Best-effort creation time in milliseconds since epoch. */
  timestamp: number | null;
}

export interface CanvasAssetBuckets {
  image: CanvasAsset[];
  video: CanvasAsset[];
  audio: CanvasAsset[];
  model: CanvasAsset[];
}

export interface CanvasAssetDateGroup {
  /** `YYYY-MM-DD`, or null when no usable timestamp exists. */
  date: string | null;
  assets: CanvasAsset[];
}

export type CanvasMediaUrlResolver = (
  rawUrl: string | null | undefined,
) => string | null;

function dateKey(timestamp: number | null): string | null {
  if (timestamp === null) {
    return null;
  }
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function groupCanvasAssetsByDate(
  assets: readonly CanvasAsset[],
  direction: 'desc' | 'asc',
): CanvasAssetDateGroup[] {
  const groups = new Map<string | null, CanvasAsset[]>();
  for (const asset of assets) {
    const key = dateKey(asset.timestamp);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(asset);
    } else {
      groups.set(key, [asset]);
    }
  }

  const sortByTime = (left: CanvasAsset, right: CanvasAsset) => {
    const leftTime = left.timestamp ?? 0;
    const rightTime = right.timestamp ?? 0;
    return direction === 'desc'
      ? rightTime - leftTime
      : leftTime - rightTime;
  };

  const dated: CanvasAssetDateGroup[] = [];
  let undated: CanvasAsset[] | null = null;
  for (const [key, bucket] of groups) {
    bucket.sort(sortByTime);
    if (key === null) {
      undated = bucket;
    } else {
      dated.push({ date: key, assets: bucket });
    }
  }

  dated.sort((left, right) =>
    direction === 'desc'
      ? left.date! < right.date!
        ? 1
        : -1
      : left.date! < right.date!
        ? -1
        : 1,
  );
  if (undated) {
    dated.push({ date: null, assets: undated });
  }
  return dated;
}
