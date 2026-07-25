// Copyright (c) 2026 AI anime
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  SketchGridCardView,
  SketchGridGalleryView,
  type PoolImage,
  type SketchAspectRatio,
  useExportGridPrompt,
  useGenerateSketches,
  useGrids,
  useSketchGridPreview,
  useUploadGrid,
} from "@/modules/production/public";
import { queryKeys } from "@/lib/query-keys";
import { resolveMediaUrl } from "@/lib/media-url";
import { useTaskController } from "@/hooks/use-task-controller";
import type { Beat } from "@/modules/narrative_planning/public";

interface SketchGridGalleryProps {
  project: string;
  episode: number;
  beats?: Beat[];
  aspectRatio?: SketchAspectRatio;
  imageGenerationSelection?: string;
}

interface SketchGridGroup {
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

export function SketchGridGallery({
  project,
  episode,
  beats = [],
  aspectRatio = "2:3",
  imageGenerationSelection,
}: SketchGridGalleryProps) {
  const { data: gridsRes } = useGrids(project, episode);
  const groups = useMemo(
    () => buildSketchGridGroups(gridsRes?.data?.images ?? [], beats, aspectRatio),
    [aspectRatio, beats, gridsRes?.data?.images],
  );

  return (
    <SketchGridGalleryView gridCount={groups.length}>
      {groups.map((group) => (
        <SketchGridCard
          key={group.gridIndex}
          project={project}
          episode={episode}
          group={group}
          aspectRatio={aspectRatio}
          imageGenerationSelection={imageGenerationSelection}
        />
      ))}
    </SketchGridGalleryView>
  );
}

function SketchGridCard({
  project,
  episode,
  group,
  aspectRatio,
  imageGenerationSelection,
}: {
  project: string;
  episode: number;
  group: SketchGridGroup;
  aspectRatio: SketchAspectRatio;
  imageGenerationSelection?: string;
}) {
  const { t } = useTranslation();
  const generateSketches = useGenerateSketches(project, episode);
  const uploadGrid = useUploadGrid(project, episode);
  const exportGridPrompt = useExportGridPrompt(project, episode);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  const scope = `grid_${group.gridIndex}`;
  const sketchTask = useTaskController({
    key: {
      taskType: "sketch_generation",
      project,
      episode,
      scope,
    },
    invalidateKeys: [
      queryKeys.grids(project, episode),
      queryKeys.beats(project, episode),
      queryKeys.pipelineStatus(project),
    ],
  });
  const gridUrl = resolveMediaUrl(group.gridUrl);
  const fallbackCells = (
    group.fallbackCells.length > 0
      ? group.fallbackCells
      : group.cells.map((cell) => ({
          beatNumber: cell.original_beat,
          url: cell.cell_url,
        }))
  ).map((cell) => ({
    ...cell,
    url: resolveMediaUrl(cell.url),
  }));
  const hasFallbackPreview = fallbackCells.some((cell) => cell.url);
  const sketchPreview = useSketchGridPreview(project, episode, {
    gridIndex: group.gridIndex,
    rows: group.rows,
    cols: group.cols,
    beatNumbers: group.beatNumbers,
    enabled: !gridUrl && !hasFallbackPreview,
  });
  const generatedPreviewUrl =
    sketchPreview.data?.ok === true
      ? resolveMediaUrl(sketchPreview.data.data?.previewUrl)
      : null;

  const handleGenerate = async () => {
    try {
      const res = await generateSketches.mutateAsync({
        gridIndex: group.gridIndex,
        sketchSceneGrouping: true,
        aspectRatio,
        ...(imageGenerationSelection
          ? { imageGenerationSelection }
          : {}),
      });
      if (res.ok === false) {
        toast.error(res.error || t("episode.workbench.sketchGrid.regenFailed"));
        return;
      }
      sketchTask.start({ scope });
      toast.success(
        t("episode.workbench.sketchGrid.regenStarted", {
          n: group.gridIndex,
        }),
      );
    } catch {
      toast.error(t("episode.workbench.sketchGrid.regenFailed"));
    }
  };

  const handleUpload = async (file: File) => {
    try {
      const res = await uploadGrid.mutateAsync({
        gridIndex: group.gridIndex,
        file,
        gridType: "sketch",
        modeKey: group.modeKey,
        beatNumbers: group.beatNumbers,
      });
      if (res.ok === false) {
        toast.error(res.error || t("episode.workbench.sketchGrid.uploadFailed"));
        return;
      }
      toast.success(
        t("episode.workbench.sketchGrid.uploadSuccess", {
          n: group.gridIndex,
        }),
      );
    } catch {
      toast.error(t("episode.workbench.sketchGrid.uploadFailed"));
    }
  };

  const handleExportPrompt = async () => {
    try {
      const res = await exportGridPrompt.mutateAsync({
        gridIndex: group.gridIndex,
        gridType: "sketch",
        modeKey: group.modeKey,
        beatNumbers: group.beatNumbers,
      });
      if (res.ok === false) {
        toast.error(res.error || t("episode.workbench.sketchGrid.promptFailed"));
        return;
      }
      setPromptText(res.data.prompt);
      setPromptOpen(true);
    } catch {
      toast.error(t("episode.workbench.sketchGrid.promptFailed"));
    }
  };

  const handleCopyPrompt = async () => {
    await navigator.clipboard?.writeText(promptText);
    toast.success(t("episode.workbench.sketchGrid.copySuccess"));
  };

  const handleDownload = () => {
    if (!gridUrl) return;
    const a = document.createElement("a");
    a.href = gridUrl;
    a.download = `sketch_grid_${group.gridIndex}.png`;
    a.click();
  };

  return (
    <SketchGridCardView
      aspectRatio={aspectRatio}
      beatNumbers={group.beatNumbers}
      cellCount={group.cells.length}
      cols={group.cols}
      exportPromptPending={exportGridPrompt.isPending}
      fallbackCells={fallbackCells}
      generatedPreviewUrl={generatedPreviewUrl}
      generationPending={generateSketches.isPending}
      generationStarted={sketchTask.started}
      generationStopping={sketchTask.stopping}
      gridIndex={group.gridIndex}
      gridUrl={gridUrl}
      promptOpen={promptOpen}
      promptText={promptText}
      rows={group.rows}
      sceneId={group.sceneId}
      uploadPending={uploadGrid.isPending}
      onCopyPrompt={handleCopyPrompt}
      onDownload={handleDownload}
      onExportPrompt={handleExportPrompt}
      onGenerate={handleGenerate}
      onPromptOpenChange={setPromptOpen}
      onStopGeneration={sketchTask.stop}
      onUpload={handleUpload}
    />
  );
}

function buildSketchGridGroups(
  images: PoolImage[],
  beats: Beat[] = [],
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
    if (image.type !== "sketch") continue;
    if (!image.grid_url) continue;
    const key = image.grid_url || image.grid_path || `${image.grid_index}`;
    const next = byGridUrl.get(key) ?? [];
    next.push(image);
    byGridUrl.set(key, next);
  }

  const byGrid = new Map<number, PoolImage[][]>();
  const plannedGroups = [...groups.values()];
  for (const cells of byGridUrl.values()) {
    const gridIndex = findBestPlannedGridIndex(cells, plannedGroups);
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
      beatNumbers: existing?.beatNumbers.length ? existing.beatNumbers : beatNumbers,
    });
  }

  for (const group of groups.values()) {
    group.fallbackCells = group.beatNumbers.map((beatNumber) => ({
      beatNumber,
      url: beatSketchUrls.get(beatNumber) ?? latestSketchByBeat.get(beatNumber)?.cell_url ?? null,
    }));
  }

  return [...groups.values()].sort((left, right) => left.gridIndex - right.gridIndex);
}

function findBestPlannedGridIndex(
  cells: PoolImage[],
  plannedGroups: SketchGridGroup[],
): number {
  const fallbackGridIndex = Number(cells[0]?.grid_index);
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
    if (overlap === 0) continue;
    const exactBeatSet =
      overlap === plannedBeats.size && overlap === cellBeats.size ? 1000 : 0;
    const modeBonus = mode && mode === group.modeKey ? 50 : 0;
    const score = exactBeatSet + modeBonus + overlap;
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { gridIndex: group.gridIndex, score };
    }
  }

  if (bestMatch) return bestMatch.gridIndex;
  return Number.isFinite(fallbackGridIndex) ? fallbackGridIndex : 0;
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
  return [...candidates].sort((left, right) => {
    const leftOverlap = plannedBeats.size > 0 ? beatOverlap(left, plannedBeats) : 0;
    const rightOverlap = plannedBeats.size > 0 ? beatOverlap(right, plannedBeats) : 0;
    if (leftOverlap !== rightOverlap) return rightOverlap - leftOverlap;

    const leftFresh = left.some((cell) => !cell.stale) ? 1 : 0;
    const rightFresh = right.some((cell) => !cell.stale) ? 1 : 0;
    if (leftFresh !== rightFresh) return rightFresh - leftFresh;

    return latestGeneratedAt(right) - latestGeneratedAt(left);
  })[0] ?? [];
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
    ...cells.map((cell) => (cell.generated_at ? Date.parse(cell.generated_at) : 0)),
  );
}

const SKETCH_2_3_MODES = [
  { capacity: 1, rows: 1, cols: 1, modeKey: "1x1_2-3_sketch" },
  { capacity: 4, rows: 2, cols: 2, modeKey: "2x2_2-3_sketch" },
  { capacity: 9, rows: 3, cols: 3, modeKey: "3x3_2-3_sketch" },
  { capacity: 16, rows: 4, cols: 4, modeKey: "4x4_2-3_sketch" },
  { capacity: 25, rows: 5, cols: 5, modeKey: "5x5_2-3_sketch" },
];

const SKETCH_16_9_MODES = [
  { capacity: 1, rows: 1, cols: 1, modeKey: "1x1_16-9_sketch" },
  { capacity: 4, rows: 2, cols: 2, modeKey: "2x2_16-9_sketch" },
  { capacity: 9, rows: 3, cols: 3, modeKey: "3x3_16-9_sketch" },
  { capacity: 16, rows: 4, cols: 4, modeKey: "4x4_16-9_sketch" },
  { capacity: 25, rows: 5, cols: 5, modeKey: "5x5_16-9_sketch" },
];

function buildPlannedSketchGridGroups(
  beats: Beat[],
  aspectRatio: SketchAspectRatio,
): SketchGridGroup[] {
  if (beats.length === 0) return [];
  const byScene = new Map<string, Beat[]>();
  for (const beat of beats) {
    if (isSpaceMapBeat(beat)) continue;
    const scene = getBeatSceneId(beat);
    const sceneBeats = byScene.get(scene) ?? [];
    sceneBeats.push(beat);
    byScene.set(scene, sceneBeats);
  }

  const groups: SketchGridGroup[] = [];
  const modes = aspectRatio === "16:9" ? SKETCH_16_9_MODES : SKETCH_2_3_MODES;
  for (const [sceneId, sceneBeats] of byScene.entries()) {
    let offset = 0;
    while (offset < sceneBeats.length) {
      const remaining = Math.min(sceneBeats.length - offset, 25);
      const mode =
        modes.find((item) => remaining <= item.capacity) ??
        modes[modes.length - 1];
      const chunk = sceneBeats.slice(offset, offset + mode.capacity);
      groups.push({
        gridIndex: groups.length,
        gridUrl: null,
        cells: [],
        fallbackCells: chunk.map((beat) => ({
          beatNumber: beat.beat_number,
          url: beat.sketch_url ?? null,
        })),
        rows: mode.rows,
        cols: mode.cols,
        modeKey: mode.modeKey,
        beatNumbers: chunk.map((beat) => beat.beat_number),
        sceneId,
      });
      offset += mode.capacity;
    }
  }
  return groups;
}

function getBeatSceneId(beat: Beat): string {
  return (
    beat.scene_ref?.scene_id?.trim() ||
    beat.location?.trim() ||
    beat.location_description?.trim() ||
    "未知场景"
  );
}

function isSpaceMapBeat(beat: Beat): boolean {
  const visual = (beat.visual_description ?? "").trim().toLowerCase();
  return (
    visual.startsWith("[space_map") ||
    visual.startsWith("[space_anchor_map]") ||
    visual.startsWith("[absolute_layout_map]")
  );
}
