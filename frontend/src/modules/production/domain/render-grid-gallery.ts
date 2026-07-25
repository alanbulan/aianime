// Copyright (c) 2026 AI anime
import type { PoolImage } from "@/modules/production/domain/image-pool";

export interface RenderGridBeat {
  beat_number: number;
  location?: string;
  location_description?: string;
  scene_ref?: { scene_id?: string | null } | null;
}

export interface RenderGridGroup {
  gridIndex: number;
  gridUrl: string;
  cells: PoolImage[];
  rows: number;
  cols: number;
  modeKey: string;
  beatNumbers: number[];
}

export function buildRenderGridGroups(
  images: PoolImage[],
  beats: RenderGridBeat[] = [],
): RenderGridGroup[] {
  const byGridUrl = new Map<string, PoolImage[]>();
  for (const image of images) {
    if (image.type !== "render" || !image.grid_url) continue;
    const next = byGridUrl.get(image.grid_url) ?? [];
    next.push(image);
    byGridUrl.set(image.grid_url, next);
  }

  const batches = [...byGridUrl.values()].sort(compareRenderGridBatches);
  const plannedGroups = buildPlannedRenderGridGroups(beats);
  const gridIndexCounts = new Map<number, number>();
  for (const cells of batches) {
    const gridIndex = Number(cells[0]?.grid_index);
    if (!Number.isFinite(gridIndex)) continue;
    gridIndexCounts.set(gridIndex, (gridIndexCounts.get(gridIndex) ?? 0) + 1);
  }

  return batches.map((cells, orderIndex) => {
    const ordered = [...cells].sort((a, b) => a.cell_index - b.cell_index);
    const sourceGridIndex = Number(ordered[0]?.grid_index);
    const plannedGridIndex = findBestPlannedGridIndex(ordered, plannedGroups);
    const gridIndex =
      plannedGridIndex ??
      (Number.isFinite(sourceGridIndex) &&
      gridIndexCounts.get(sourceGridIndex) === 1
        ? sourceGridIndex
        : orderIndex);
    const rows = Math.max(1, ...ordered.map((cell) => Number(cell.row) + 1));
    const cols = Math.max(1, ...ordered.map((cell) => Number(cell.col) + 1));
    const modeKey = ordered[0]?.mode || `${rows}x${cols}`;
    const beatNumbers = [
      ...new Set(
        ordered
          .map((cell) => Number(cell.original_beat))
          .filter((beat) => Number.isFinite(beat) && beat > 0),
      ),
    ].sort((a, b) => a - b);
    return {
      gridIndex,
      gridUrl: ordered[0]?.grid_url ?? "",
      cells: ordered,
      rows,
      cols,
      modeKey,
      beatNumbers,
    };
  });
}

function buildPlannedRenderGridGroups(
  beats: RenderGridBeat[],
): { gridIndex: number; beatNumbers: number[] }[] {
  if (beats.length === 0) return [];
  const byScene = new Map<string, RenderGridBeat[]>();
  for (const beat of beats) {
    const scene = getBeatSceneId(beat);
    const sceneBeats = byScene.get(scene) ?? [];
    sceneBeats.push(beat);
    byScene.set(scene, sceneBeats);
  }

  const groups: { gridIndex: number; beatNumbers: number[] }[] = [];
  for (const sceneBeats of byScene.values()) {
    for (let offset = 0; offset < sceneBeats.length; offset += 25) {
      groups.push({
        gridIndex: groups.length,
        beatNumbers: sceneBeats
          .slice(offset, offset + 25)
          .map((beat) => beat.beat_number),
      });
    }
  }
  return groups;
}

function findBestPlannedGridIndex(
  cells: PoolImage[],
  plannedGroups: { gridIndex: number; beatNumbers: number[] }[],
): number | null {
  let best: { gridIndex: number; score: number } | null = null;
  const cellBeats = new Set(
    cells
      .map((cell) => Number(cell.original_beat))
      .filter((beat) => Number.isFinite(beat) && beat > 0),
  );
  for (const group of plannedGroups) {
    const plannedBeats = new Set(group.beatNumbers);
    let overlap = 0;
    for (const beat of cellBeats) {
      if (plannedBeats.has(beat)) overlap += 1;
    }
    if (overlap === 0) continue;
    const exactBeatSet =
      overlap === cellBeats.size && overlap === plannedBeats.size ? 1000 : 0;
    const score = exactBeatSet + overlap;
    if (!best || score > best.score) {
      best = { gridIndex: group.gridIndex, score };
    }
  }
  return best?.gridIndex ?? null;
}

function getBeatSceneId(beat: RenderGridBeat): string {
  return (
    beat.scene_ref?.scene_id?.trim() ||
    beat.location?.trim() ||
    beat.location_description?.trim() ||
    "unknown-scene"
  );
}

function compareRenderGridBatches(
  left: PoolImage[],
  right: PoolImage[],
): number {
  const leftMinBeat = minOriginalBeat(left);
  const rightMinBeat = minOriginalBeat(right);
  if (leftMinBeat !== rightMinBeat) return leftMinBeat - rightMinBeat;
  return latestGeneratedAt(right) - latestGeneratedAt(left);
}

function minOriginalBeat(cells: PoolImage[]): number {
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    ...cells
      .map((cell) => Number(cell.original_beat))
      .filter((beat) => Number.isFinite(beat) && beat > 0),
  );
}

function latestGeneratedAt(cells: PoolImage[]): number {
  return Math.max(
    0,
    ...cells.map((cell) =>
      cell.generated_at ? Date.parse(cell.generated_at) : 0,
    ),
  );
}
