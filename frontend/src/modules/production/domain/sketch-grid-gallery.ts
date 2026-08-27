// Copyright (c) 2026 AI anime
import type { PoolImage } from "@/modules/production/domain/image-pool";
import type { SketchAspectRatio } from "@/modules/production/domain/image-settings";

export interface SketchGridBeat {
  beat_number: number;
  location?: string;
  location_description?: string;
  scene_ref?: { scene_id?: string | null } | null;
  sketch_url?: string | null;
  visual_description?: string;
}

export interface SketchGridGroup {
  gridIndex: number;
  gridUrl: string | null;
  cells: PoolImage[];
  fallbackCells: { beatNumber: number; url: string | null }[];
  rows: number;
  cols: number;
  modeKey: string;
  beatNumbers: number[];
  sceneId?: string;
}

export function buildSketchGridGroups(
  images: PoolImage[],
  beats: SketchGridBeat[] = [],
  aspectRatio: SketchAspectRatio = "2:3",
): SketchGridGroup[] {
  const planned = buildPlannedSketchGridGroups(beats, aspectRatio);
  const beatSketchUrls = new Map(
    beats.map((beat) => [beat.beat_number, beat.sketch_url ?? null]),
  );
  const latestSketchByBeat = buildLatestSketchByBeat(images);
  const groups = new Map<number, SketchGridGroup>();
  for (const group of planned) {
    groups.set(group.gridIndex, group);
  }

  const byGridUrl = new Map<string, PoolImage[]>();
  for (const image of images) {
    if (image.type !== "sketch" || !image.grid_url) continue;
    const next = byGridUrl.get(image.grid_url) ?? [];
    next.push(image);
    byGridUrl.set(image.grid_url, next);
  }

  const byGrid = new Map<number, PoolImage[][]>();
  const plannedGroups = [...groups.values()];
  for (const cells of byGridUrl.values()) {
    const gridIndex = findBestPlannedGridIndex(cells, plannedGroups);
    if (gridIndex === null) continue;
    const next = byGrid.get(gridIndex) ?? [];
    next.push(cells);
    byGrid.set(gridIndex, next);
  }

  for (const [gridIndex, candidates] of byGrid.entries()) {
    const cells = pickCurrentGridCells(candidates, groups.get(gridIndex));
    const ordered = [...cells].sort((a, b) => a.cell_index - b.cell_index);
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
    const existing = groups.get(gridIndex);
    groups.set(gridIndex, {
      ...existing,
      gridIndex,
      gridUrl: ordered[0]?.grid_url ?? "",
      cells: ordered,
      fallbackCells: existing?.fallbackCells ?? [],
      rows: existing?.rows ?? rows,
      cols: existing?.cols ?? cols,
      modeKey: existing?.modeKey ?? modeKey,
      beatNumbers: existing?.beatNumbers.length
        ? existing.beatNumbers
        : beatNumbers,
    });
  }

  for (const group of groups.values()) {
    group.fallbackCells = group.beatNumbers.map((beatNumber) => ({
      beatNumber,
      url:
        beatSketchUrls.get(beatNumber) ??
        latestSketchByBeat.get(beatNumber)?.cell_url ??
        null,
    }));
  }

  return [...groups.values()].sort(
    (left, right) => left.gridIndex - right.gridIndex,
  );
}

function findBestPlannedGridIndex(
  cells: PoolImage[],
  plannedGroups: SketchGridGroup[],
): number | null {
  const fallbackGridIndex = Number(cells[0]?.grid_index);
  if (plannedGroups.length === 0) {
    return Number.isFinite(fallbackGridIndex) ? fallbackGridIndex : 0;
  }

  let bestMatch: { gridIndex: number; score: number } | null = null;
  const cellBeats = new Set(
    cells
      .map((cell) => Number(cell.original_beat))
      .filter((beat) => Number.isFinite(beat) && beat > 0),
  );
  const mode = cells[0]?.mode;

  for (const group of plannedGroups) {
    const plannedBeats = new Set(group.beatNumbers);
    const overlap = beatOverlap(cells, plannedBeats);
    const exactBeatSet =
      overlap === plannedBeats.size && overlap === cellBeats.size;
    if (!exactBeatSet) continue;
    const modeBonus = mode && mode === group.modeKey ? 50 : 0;
    const score = modeBonus + overlap;
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { gridIndex: group.gridIndex, score };
    }
  }

  if (bestMatch) return bestMatch.gridIndex;
  return null;
}

function buildLatestSketchByBeat(images: PoolImage[]): Map<number, PoolImage> {
  const byBeat = new Map<number, PoolImage>();
  for (const image of images) {
    if (image.type !== "sketch" || !image.cell_url) continue;
    const beatNumber = Number(image.original_beat);
    if (!Number.isFinite(beatNumber) || beatNumber <= 0) continue;
    const current = byBeat.get(beatNumber);
    if (!current || comparePoolImageFreshness(image, current) > 0) {
      byBeat.set(beatNumber, image);
    }
  }
  return byBeat;
}

function comparePoolImageFreshness(left: PoolImage, right: PoolImage): number {
  const leftFresh = left.stale ? 0 : 1;
  const rightFresh = right.stale ? 0 : 1;
  if (leftFresh !== rightFresh) return leftFresh - rightFresh;
  const leftTime = left.generated_at ? Date.parse(left.generated_at) : 0;
  const rightTime = right.generated_at ? Date.parse(right.generated_at) : 0;
  return leftTime - rightTime;
}

function pickCurrentGridCells(
  candidates: PoolImage[][],
  planned?: SketchGridGroup,
): PoolImage[] {
  const plannedBeats = new Set(planned?.beatNumbers ?? []);
  return (
    [...candidates].sort((left, right) => {
      const leftOverlap =
        plannedBeats.size > 0 ? beatOverlap(left, plannedBeats) : 0;
      const rightOverlap =
        plannedBeats.size > 0 ? beatOverlap(right, plannedBeats) : 0;
      if (leftOverlap !== rightOverlap) return rightOverlap - leftOverlap;

      const leftFresh = left.some((cell) => !cell.stale) ? 1 : 0;
      const rightFresh = right.some((cell) => !cell.stale) ? 1 : 0;
      if (leftFresh !== rightFresh) return rightFresh - leftFresh;

      return latestGeneratedAt(right) - latestGeneratedAt(left);
    })[0] ?? []
  );
}

function beatOverlap(cells: PoolImage[], beats: Set<number>): number {
  const seen = new Set<number>();
  for (const cell of cells) {
    const beat = Number(cell.original_beat);
    if (beats.has(beat)) seen.add(beat);
  }
  return seen.size;
}

function latestGeneratedAt(cells: PoolImage[]): number {
  return Math.max(
    0,
    ...cells.map((cell) =>
      cell.generated_at ? Date.parse(cell.generated_at) : 0,
    ),
  );
}

function buildPlannedSketchGridGroups(
  beats: SketchGridBeat[],
  aspectRatio: SketchAspectRatio,
): SketchGridGroup[] {
  if (beats.length === 0) return [];
  const modeKey =
    aspectRatio === "16:9" ? "1x1_16-9_sketch" : "1x1_2-3_sketch";
  return beats
    .filter((beat) => !isSpaceMapBeat(beat))
    .map((beat, gridIndex) => ({
      gridIndex,
      gridUrl: null,
      cells: [],
      fallbackCells: [
        {
          beatNumber: beat.beat_number,
          url: beat.sketch_url ?? null,
        },
      ],
      rows: 1,
      cols: 1,
      modeKey,
      beatNumbers: [beat.beat_number],
      sceneId: getBeatSceneId(beat),
    }));
}

function getBeatSceneId(beat: SketchGridBeat): string {
  return (
    beat.scene_ref?.scene_id?.trim() ||
    beat.location?.trim() ||
    beat.location_description?.trim() ||
    "unknown-scene"
  );
}

function isSpaceMapBeat(beat: SketchGridBeat): boolean {
  const visual = (beat.visual_description ?? "").trim().toLowerCase();
  return (
    visual.startsWith("[space_map") ||
    visual.startsWith("[space_anchor_map]") ||
    visual.startsWith("[absolute_layout_map]")
  );
}
