// Copyright (c) 2026 AI anime
import type { SketchAspectRatio } from "@/modules/production/domain/image-settings";

export interface RegenMode {
  key: string;
  label: string;
  capacity: number;
}

export interface SketchRegenBeat {
  beat_number: number;
  scene_id?: string | null;
  scene_ref?: { scene_id?: string | null } | null;
}

export interface SketchRegenTask {
  task_type: string;
  scope?: string;
  status: string;
  result?: unknown;
  metadata?: Record<string, unknown>;
}

export interface SketchRegenQueueItem {
  id: string;
  modeKey: string;
  modeLabel: string;
  beatNumbers: number[];
  sceneIds: string[];
  createdAt: string;
  taskScope?: string;
}

export interface SketchRegenQueueData {
  items: SketchRegenQueueItem[];
}

export type SketchRegenPreflight =
  | {
      ok: true;
      sceneIds: string[];
      missingBeatNumbers: [];
    }
  | {
      ok: false;
      reason: "missing_scene" | "mixed_scene";
      sceneIds: string[];
      missingBeatNumbers: number[];
    };

export type SketchRegenQueueConflict =
  | { type: "duplicate"; beatNumbers: number[] }
  | { type: "overlap"; beatNumbers: number[] };

export interface BatchPanelActionPendingState {
  count: number;
  regenSketchesPending: boolean;
  sketchTaskStarted: boolean;
  saveSketchQueuePending: boolean;
  generateAudioPending: boolean;
  audioTaskStarted: boolean;
  renderPlanTaskStarted?: boolean;
  selectedVideoRunning?: boolean;
}

/** Sketch regeneration modes, matching NiceGUI _selected_sketch_regen_mode_keys(). */
export const SKETCH_REGEN_MODES: readonly RegenMode[] = [
  { key: "5x5_2-3_sketch", label: "5×5_2:3 Sketch", capacity: 25 },
  { key: "1x1_2-3_sketch", label: "1×1_2:3 Sketch", capacity: 1 },
  { key: "1x1_1-1_sketch", label: "1×1_1:1 Sketch", capacity: 1 },
  { key: "2x2_2-3_sketch", label: "2×2_2:3 Sketch", capacity: 4 },
  { key: "3x3_2-3_sketch", label: "3×3_2:3 Sketch", capacity: 9 },
  { key: "1x1_1-1", label: "1×1_1:1 1K", capacity: 1 },
  { key: "1x1_9-16_sketch", label: "1×1_9:16 Sketch", capacity: 1 },
  { key: "1x1_16-9_sketch", label: "1×1_16:9 Sketch", capacity: 1 },
  { key: "1x2_4-3_sketch", label: "1×2_4:3 Sketch", capacity: 2 },
  { key: "2x2_1-1", label: "2×2_1:1 2K", capacity: 4 },
  { key: "2x2_16-9_sketch", label: "2×2_16:9 Sketch", capacity: 4 },
  { key: "2x2_9-16_sketch", label: "2×2_9:16 Sketch", capacity: 4 },
  { key: "2x4_4-3_sketch", label: "2×4_4:3 Sketch", capacity: 8 },
  { key: "3x2_2-3", label: "3×2_2:3 2K", capacity: 6 },
  { key: "3x3_1-1_sketch", label: "3×3_1:1 Sketch", capacity: 9 },
  { key: "3x3_9-16_sketch", label: "3×3_9:16 Sketch", capacity: 9 },
  { key: "3x3_3-4_sketch", label: "3×3_3:4 Sketch", capacity: 9 },
  { key: "3x3_16-9_sketch", label: "3×3_16:9 Sketch", capacity: 9 },
  { key: "4x3_3-4_sketch", label: "4×3_3:4 Sketch", capacity: 12 },
  { key: "4x4_1-1_sketch", label: "4×4_1:1 Sketch", capacity: 16 },
  { key: "4x4_16-9_sketch", label: "4×4_16:9 Sketch", capacity: 16 },
  { key: "5x5_1-1_sketch", label: "5×5_1:1 Sketch", capacity: 25 },
  { key: "5x5_16-9_sketch", label: "5×5_16:9 Sketch", capacity: 25 },
  { key: "5x5_9-16_sketch", label: "5×5_9:16 Sketch", capacity: 25 },
  { key: "5x5_1-1", label: "5×5_1:1 4K", capacity: 25 },
];

/** Render regeneration modes (2:3 aspect, publication quality 1K-2K). */
export const RENDER_REGEN_MODES: readonly RegenMode[] = [
  { key: "1x1_2-3", label: "1×1_2:3", capacity: 1 },
  { key: "2x2_2-3", label: "2×2_2:3", capacity: 4 },
  { key: "3x3_2-3", label: "3×3_2:3", capacity: 9 },
];

export function bestFitMode(
  modes: readonly RegenMode[],
  count: number,
): RegenMode {
  const fitting = modes.filter((mode) => mode.capacity >= count);
  if (fitting.length === 0) return modes[modes.length - 1];
  return fitting.reduce((best, mode) =>
    mode.capacity < best.capacity ? mode : best,
  );
}

export function overflowBatchCount(
  mode: RegenMode,
  selectedCount: number,
): number {
  return Math.ceil(selectedCount / mode.capacity);
}

function sketchRegenSceneId(beat: SketchRegenBeat): string {
  return beat.scene_ref?.scene_id?.trim() || beat.scene_id?.trim() || "";
}

export function getSketchRegenSceneIds(
  beats: readonly SketchRegenBeat[],
  beatNumbers: readonly number[],
): string[] {
  const byNumber = new Map(beats.map((beat) => [beat.beat_number, beat]));
  const seen = new Set<string>();
  const sceneIds: string[] = [];
  for (const beatNumber of beatNumbers) {
    const beat = byNumber.get(beatNumber);
    if (!beat) continue;
    const sceneId = sketchRegenSceneId(beat);
    if (!sceneId || seen.has(sceneId)) continue;
    seen.add(sceneId);
    sceneIds.push(sceneId);
  }
  return sceneIds;
}

export function getSketchRegenPreflight(
  beats: readonly SketchRegenBeat[],
  beatNumbers: readonly number[],
): SketchRegenPreflight {
  const byNumber = new Map(beats.map((beat) => [beat.beat_number, beat]));
  const sceneIds = getSketchRegenSceneIds(beats, beatNumbers);
  const missingBeatNumbers = beatNumbers.filter((beatNumber) => {
    const beat = byNumber.get(beatNumber);
    return !beat || !sketchRegenSceneId(beat);
  });

  if (beatNumbers.length > 1 && missingBeatNumbers.length > 0) {
    return { ok: false, reason: "missing_scene", sceneIds, missingBeatNumbers };
  }
  if (sceneIds.length > 1) {
    return { ok: false, reason: "mixed_scene", sceneIds, missingBeatNumbers: [] };
  }
  return { ok: true, sceneIds, missingBeatNumbers: [] };
}

export function createSketchRegenQueueItem(
  beats: readonly SketchRegenBeat[],
  beatNumbers: readonly number[],
  mode: RegenMode,
): SketchRegenQueueItem {
  const normalizedBeatNumbers = [...new Set(beatNumbers)].sort((a, b) => a - b);
  return {
    id: `${mode.key}:${normalizedBeatNumbers.join(",")}`,
    modeKey: mode.key,
    modeLabel: mode.label,
    beatNumbers: normalizedBeatNumbers,
    sceneIds: getSketchRegenSceneIds(beats, normalizedBeatNumbers),
    createdAt: new Date().toISOString(),
  };
}

export function singleSketchModeForAspect(
  sketchAspect: SketchAspectRatio,
): RegenMode {
  const key = sketchAspect === "16:9" ? "1x1_16-9_sketch" : "1x1_2-3_sketch";
  return (
    SKETCH_REGEN_MODES.find((mode) => mode.key === key) ??
    SKETCH_REGEN_MODES.find((mode) => mode.key === "1x1_2-3_sketch") ??
    SKETCH_REGEN_MODES[0]
  );
}

export function createSingleSketchRegenQueueItems(
  beats: readonly SketchRegenBeat[],
  beatNumbers: readonly number[],
  sketchAspect: SketchAspectRatio,
): SketchRegenQueueItem[] {
  const mode = singleSketchModeForAspect(sketchAspect);
  return [...new Set(beatNumbers)]
    .sort((a, b) => a - b)
    .map((beatNumber) => createSketchRegenQueueItem(beats, [beatNumber], mode));
}

export function createAutoSketchRegenQueueItems(
  beats: readonly SketchRegenBeat[],
  beatNumbers: readonly number[],
  sketchAspect: SketchAspectRatio,
): SketchRegenQueueItem[] {
  return createSketchRegenPlanItems(beats, beatNumbers, sketchAspect);
}

export function createSketchRegenPlanItems(
  beats: readonly SketchRegenBeat[],
  beatNumbers: readonly number[],
  sketchAspect: SketchAspectRatio,
): SketchRegenQueueItem[] {
  const modes = sketchRegenModesForAspect(SKETCH_REGEN_MODES, sketchAspect);
  const byNumber = new Map(beats.map((beat) => [beat.beat_number, beat]));
  const groups = new Map<string, number[]>();

  for (const beatNumber of [...new Set(beatNumbers)].sort((a, b) => a - b)) {
    const beat = byNumber.get(beatNumber);
    const sceneId = beat ? sketchRegenSceneId(beat) : "";
    const groupKey = sceneId || `beat:${beatNumber}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), beatNumber]);
  }

  return [...groups.values()].map((groupBeatNumbers) => {
    const mode = bestFitMode(modes, groupBeatNumbers.length);
    return createSketchRegenQueueItem(beats, groupBeatNumbers, mode);
  });
}

export function getSketchRegenQueueConflict(
  queue: readonly SketchRegenQueueItem[],
  next: SketchRegenQueueItem,
): SketchRegenQueueConflict | null {
  const duplicate = queue.find((item) => item.id === next.id);
  if (duplicate) {
    return { type: "duplicate", beatNumbers: next.beatNumbers };
  }
  const nextBeats = new Set(next.beatNumbers);
  const overlap = [
    ...new Set(
      queue.flatMap((item) =>
        item.beatNumbers.filter((beatNumber) => nextBeats.has(beatNumber)),
      ),
    ),
  ].sort((a, b) => a - b);
  if (overlap.length > 0) {
    return { type: "overlap", beatNumbers: overlap };
  }
  return null;
}

export function sketchRegenUsageScope(item: SketchRegenQueueItem): string {
  return `sketch_grid:${item.modeKey}:${item.beatNumbers.join("-")}`;
}

export function sketchPlanGridLabel(modeKey: string): string {
  const match = /^(\d+)x(\d+)_/.exec(modeKey);
  return match ? `${match[1]}×${match[2]}` : modeKey;
}

function normalizeRatio(w: number, h: number): string | null {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return null;
  }
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(Math.round(w), Math.round(h));
  return `${Math.round(w) / divisor}:${Math.round(h) / divisor}`;
}

export function sketchModeCellAspect(modeKey: string): string | null {
  const match = /^(\d+)x(\d+)_(\d+)-(\d+)(?:_sketch)?$/.exec(modeKey);
  if (!match) return null;
  const rows = Number(match[1]);
  const cols = Number(match[2]);
  const width = Number(match[3]);
  const height = Number(match[4]);
  return normalizeRatio(width * rows, height * cols);
}

export function sketchRegenModelCallCount(
  items: readonly SketchRegenQueueItem[],
): number {
  return items.reduce((sum, item) => {
    const mode = SKETCH_REGEN_MODES.find(
      (candidate) => candidate.key === item.modeKey,
    );
    return sum + (mode ? overflowBatchCount(mode, item.beatNumbers.length) : 1);
  }, 0);
}

export function sketchRegenModesForAspect(
  modes: readonly RegenMode[],
  sketchAspect: SketchAspectRatio,
): readonly RegenMode[] {
  const compatible = modes.filter(
    (mode) =>
      mode.key.endsWith("_sketch") &&
      sketchModeCellAspect(mode.key) === sketchAspect,
  );
  return compatible.length > 0 ? compatible : modes;
}

export function findSketchRegenQueueTask<T extends SketchRegenTask>(
  tasks: readonly T[] | undefined,
  item: SketchRegenQueueItem,
  isSketchRegenTask: (task: T) => boolean,
): T | null {
  if (!item.taskScope) return null;
  return (
    tasks?.find(
      (task) => isSketchRegenTask(task) && task.scope === item.taskScope,
    ) ?? null
  );
}

function taskMetadata(task: SketchRegenTask): Record<string, unknown> {
  const direct = task.metadata;
  if (direct && typeof direct === "object") return direct;
  if (!task.result || typeof task.result !== "object") return {};
  const metadata = (task.result as { task_metadata?: unknown }).task_metadata;
  return metadata && typeof metadata === "object"
    ? (metadata as Record<string, unknown>)
    : {};
}

function normalizeTaskBeatNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => Number(item)).filter(Number.isFinite))].sort(
    (a, b) => a - b,
  );
}

function sameBeatNumbers(
  left: readonly number[],
  right: readonly number[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((beatNumber, index) => beatNumber === right[index]);
}

export function getLockedSketchRegenItemIds<T extends SketchRegenTask>(
  tasks: readonly T[] | undefined,
  items: readonly Pick<
    SketchRegenQueueItem,
    "id" | "modeKey" | "beatNumbers" | "taskScope"
  >[],
  isActiveSketchRegenTask: (task: T) => boolean,
): Set<string> {
  const locked = new Set<string>();
  if (!tasks?.length || items.length === 0) return locked;

  const itemsByLegacyScope = new Map(
    items.filter((item) => item.taskScope).map((item) => [item.taskScope, item]),
  );

  for (const task of tasks) {
    if (!isActiveSketchRegenTask(task)) continue;

    const legacyItem = task.scope ? itemsByLegacyScope.get(task.scope) : undefined;
    if (legacyItem) {
      locked.add(legacyItem.id);
      continue;
    }

    const metadata = taskMetadata(task);
    const modeKey = typeof metadata.mode_key === "string" ? metadata.mode_key : "";
    const taskBeatNumbers = normalizeTaskBeatNumbers(
      metadata.selected_beat_numbers ?? metadata.beat_numbers ?? metadata.beat_indices,
    );
    if (!modeKey || taskBeatNumbers.length === 0) continue;

    for (const item of items) {
      if (item.modeKey !== modeKey) continue;
      if (!sameBeatNumbers(item.beatNumbers, taskBeatNumbers)) continue;
      locked.add(item.id);
    }
  }

  return locked;
}

export function shouldShowSketchModeSpinner({
  regenerateRequestPending,
}: {
  regenerateRequestPending: boolean;
  sketchTaskStarted: boolean;
}): boolean {
  return regenerateRequestPending;
}

export function getBatchPanelActionDisabled({
  count,
  regenSketchesPending,
  saveSketchQueuePending,
  generateAudioPending,
  audioTaskStarted,
  renderPlanTaskStarted = false,
  selectedVideoRunning = false,
}: BatchPanelActionPendingState): {
  sketch: boolean;
  render: boolean;
  audio: boolean;
} {
  return {
    sketch: count === 0 || regenSketchesPending || saveSketchQueuePending,
    render: count === 0 || renderPlanTaskStarted || selectedVideoRunning,
    audio: count === 0 || generateAudioPending || audioTaskStarted,
  };
}
