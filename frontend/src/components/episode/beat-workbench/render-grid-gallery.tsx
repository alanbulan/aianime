// Copyright (c) 2026 AI anime
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  RenderGridCardView,
  RenderGridGalleryView,
  type PoolImage,
  useCutGrid,
  useExportGridPrompt,
  useGrids,
  useRebuildPoolIndex,
  useRegenerateGrid,
  useUploadGrid,
} from "@/modules/production/public";
import { queryKeys } from "@/lib/query-keys";
import { resolveMediaUrl } from "@/lib/media-url";
import { useProjectAspectRatio } from "@/stores/aspect-ratio-store";
import { useTaskController } from "@/hooks/use-task-controller";
import type { Beat } from "@/modules/narrative_planning/public";

interface RenderGridGalleryProps {
  project: string;
  episode: number;
  beats?: Beat[];
}

interface RenderGridGroup {
  gridIndex: number;
  gridUrl: string;
  cells: PoolImage[];
  rows: number;
  cols: number;
  modeKey: string;
  beatNumbers: number[];
}

export function RenderGridGallery({
  project,
  episode,
  beats = [],
}: RenderGridGalleryProps) {
  const { t } = useTranslation();
  const { spec } = useProjectAspectRatio(project);
  const { data: gridsRes } = useGrids(project, episode);
  const rebuildPoolIndex = useRebuildPoolIndex(project, episode);
  const groups = useMemo(
    () => buildRenderGridGroups(gridsRes?.data?.images ?? [], beats),
    [beats, gridsRes?.data?.images],
  );

  const handleRebuildPoolIndex = async () => {
    try {
      const res = await rebuildPoolIndex.mutateAsync();
      toast.success(
        t("episode.workbench.renderGrid.rebuildSuccess", {
          count: res.data.image_count,
        }),
      );
    } catch {
      toast.error(t("episode.workbench.renderGrid.rebuildFailed"));
    }
  };

  return (
    <RenderGridGalleryView
      gridCount={groups.length}
      rebuildPending={rebuildPoolIndex.isPending}
      onRebuild={handleRebuildPoolIndex}
    >
      {groups.map((group) => (
        <RenderGridCard
          key={group.gridIndex}
          project={project}
          episode={episode}
          group={group}
          cellAspect={spec.renderAspect}
        />
      ))}
    </RenderGridGalleryView>
  );
}

function RenderGridCard({
  project,
  episode,
  group,
  cellAspect,
}: {
  project: string;
  episode: number;
  group: RenderGridGroup;
  cellAspect: string;
}) {
  const { t } = useTranslation();
  const regenerateGrid = useRegenerateGrid(project, episode);
  const cutGrid = useCutGrid(project, episode);
  const uploadGrid = useUploadGrid(project, episode);
  const exportGridPrompt = useExportGridPrompt(project, episode);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  const scope = `grid_${group.gridIndex}`;
  const regenTask = useTaskController({
    key: {
      taskType: "grid_regenerate",
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

  const handleRegenerate = async () => {
    try {
      const res = await regenerateGrid.mutateAsync({
        gridIndex: group.gridIndex,
        sceneGrouping: true,
      });
      if (res.ok === false) {
        toast.error(res.error || t("episode.workbench.renderGrid.regenFailed"));
        return;
      }
      regenTask.start({ scope });
      toast.success(
        t("episode.workbench.renderGrid.regenStarted", {
          n: group.gridIndex,
        }),
      );
    } catch {
      toast.error(t("episode.workbench.renderGrid.regenFailed"));
    }
  };

  const handleCut = async () => {
    try {
      const res = await cutGrid.mutateAsync({
        gridIndex: group.gridIndex,
        rows: group.rows,
        cols: group.cols,
        modeKey: group.modeKey,
        beatNumbers: group.beatNumbers,
        gridType: "render",
      });
      if (res.ok === false) {
        toast.error(res.error || t("episode.workbench.renderGrid.cutFailed"));
        return;
      }
      toast.success(
        t("episode.workbench.renderGrid.cutSuccess", {
          n: group.gridIndex,
        }),
      );
    } catch {
      toast.error(t("episode.workbench.renderGrid.cutFailed"));
    }
  };

  const handleUpload = async (file: File) => {
    try {
      const res = await uploadGrid.mutateAsync({
        gridIndex: group.gridIndex,
        file,
        gridType: "render",
        modeKey: group.modeKey,
        beatNumbers: group.beatNumbers,
      });
      if (res.ok === false) {
        toast.error(res.error || t("episode.workbench.renderGrid.uploadFailed"));
        return;
      }
      toast.success(
        t("episode.workbench.renderGrid.uploadSuccess", {
          n: group.gridIndex,
        }),
      );
    } catch {
      toast.error(t("episode.workbench.renderGrid.uploadFailed"));
    }
  };

  const handleExportPrompt = async () => {
    try {
      const res = await exportGridPrompt.mutateAsync({
        gridIndex: group.gridIndex,
        gridType: "render",
        modeKey: group.modeKey,
        beatNumbers: group.beatNumbers,
      });
      if (res.ok === false) {
        toast.error(res.error || t("episode.workbench.renderGrid.promptFailed"));
        return;
      }
      setPromptText(res.data.prompt);
      setPromptOpen(true);
    } catch {
      toast.error(t("episode.workbench.renderGrid.promptFailed"));
    }
  };

  const handleCopyPrompt = async () => {
    await navigator.clipboard?.writeText(promptText);
    toast.success(t("episode.workbench.renderGrid.copySuccess"));
  };

  const handleDownload = () => {
    if (!gridUrl) return;
    const a = document.createElement("a");
    a.href = gridUrl;
    a.download = `render_grid_${group.gridIndex}.png`;
    a.click();
  };

  return (
    <RenderGridCardView
      beatNumbers={group.beatNumbers}
      cellAspect={cellAspect}
      cellCount={group.cells.length}
      cols={group.cols}
      cutPending={cutGrid.isPending}
      exportPromptPending={exportGridPrompt.isPending}
      gridIndex={group.gridIndex}
      gridUrl={gridUrl}
      promptOpen={promptOpen}
      promptText={promptText}
      regenerationPending={regenerateGrid.isPending}
      regenerationStarted={regenTask.started}
      regenerationStopping={regenTask.stopping}
      rows={group.rows}
      uploadPending={uploadGrid.isPending}
      onCopyPrompt={handleCopyPrompt}
      onCut={handleCut}
      onDownload={handleDownload}
      onExportPrompt={handleExportPrompt}
      onPromptOpenChange={setPromptOpen}
      onRegenerate={handleRegenerate}
      onStopRegeneration={regenTask.stop}
      onUpload={handleUpload}
    />
  );
}

function buildRenderGridGroups(
  images: PoolImage[],
  beats: Beat[] = [],
): RenderGridGroup[] {
  const byGridUrl = new Map<string, PoolImage[]>();
  for (const image of images) {
    if (image.type !== "render") continue;
    if (!image.grid_url) continue;
    const key = image.grid_url || image.grid_path || `${image.grid_index}`;
    const next = byGridUrl.get(key) ?? [];
    next.push(image);
    byGridUrl.set(key, next);
  }

  const batches = [...byGridUrl.values()].sort(compareRenderGridBatches);
  const plannedGroups = buildPlannedRenderGridGroups(beats);
  const gridIndexCounts = new Map<number, number>();
  for (const cells of batches) {
    const gridIndex = Number(cells[0]?.grid_index);
    if (!Number.isFinite(gridIndex)) continue;
    gridIndexCounts.set(gridIndex, (gridIndexCounts.get(gridIndex) ?? 0) + 1);
  }

  return batches
    .map((cells, orderIndex) => {
      const ordered = [...cells].sort((a, b) => a.cell_index - b.cell_index);
      const sourceGridIndex = Number(ordered[0]?.grid_index);
      const plannedGridIndex = findBestPlannedGridIndex(ordered, plannedGroups);
      const gridIndex =
        plannedGridIndex ??
        (Number.isFinite(sourceGridIndex) && gridIndexCounts.get(sourceGridIndex) === 1
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

function buildPlannedRenderGridGroups(beats: Beat[]): { gridIndex: number; beatNumbers: number[] }[] {
  if (beats.length === 0) return [];
  const byScene = new Map<string, Beat[]>();
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

function getBeatSceneId(beat: Beat): string {
  return (
    beat.scene_ref?.scene_id?.trim() ||
    beat.location?.trim() ||
    beat.location_description?.trim() ||
    "未知场景"
  );
}

function compareRenderGridBatches(left: PoolImage[], right: PoolImage[]): number {
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
    ...cells.map((cell) => (cell.generated_at ? Date.parse(cell.generated_at) : 0)),
  );
}
