// Copyright (c) 2026 AI anime
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useTaskController } from "@/modules/task_execution/public";
import { resolveMediaUrl } from "@/lib/media-url";
import { queryKeys } from "@/lib/query-keys";
import type {
  GridCutResponse,
  GridPromptResponse,
  GridUploadResponse,
  ImagePoolResponse,
  ProductionDataResponse,
  ProductionErrorResponse,
  ProductionTaskResponse,
} from "@/modules/production/application/ports";
import type { ImagePoolRebuildResult } from "@/modules/production/domain/image-pool";
import {
  buildRenderGridGroups,
  type RenderGridBeat,
  type RenderGridGroup,
} from "@/modules/production/domain/render-grid-gallery";
import type { RegenerateGridCommand } from "@/modules/production/domain/sketch-generation";

interface RenderGridGalleryQuery {
  data?: ImagePoolResponse;
}

interface RebuildPoolIndexMutation {
  isPending: boolean;
  mutateAsync(): Promise<ProductionDataResponse<ImagePoolRebuildResult>>;
}

export interface RenderGridGalleryControllerQueries {
  useGrids(project: string, episode: number): RenderGridGalleryQuery;
  useRebuildPoolIndex(
    project: string,
    episode: number,
  ): RebuildPoolIndexMutation;
}

export interface RenderGridGalleryControllerOptions {
  beats?: RenderGridBeat[];
  episode: number;
  project: string;
}

export interface RenderGridGalleryController {
  gridCount: number;
  groups: RenderGridGroup[];
  rebuildPending: boolean;
  onRebuild(): Promise<void>;
}

interface RegenerateGridMutation {
  isPending: boolean;
  mutateAsync(
    command: RegenerateGridCommand,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
}

interface CutGridMutation {
  isPending: boolean;
  mutateAsync(command: {
    beatNumbers: number[];
    cols: number;
    gridIndex: number;
    gridType: "render";
    modeKey: string;
    rows: number;
  }): Promise<GridCutResponse>;
}

interface UploadGridMutation {
  isPending: boolean;
  mutateAsync(command: {
    beatNumbers: number[];
    file: File;
    gridIndex: number;
    gridType: "render";
    modeKey: string;
  }): Promise<GridUploadResponse>;
}

interface ExportGridPromptMutation {
  isPending: boolean;
  mutateAsync(command: {
    beatNumbers: number[];
    gridIndex: number;
    gridType: "render";
    modeKey: string;
  }): Promise<GridPromptResponse>;
}

export interface RenderGridCardControllerQueries {
  useCutGrid(project: string, episode: number): CutGridMutation;
  useExportGridPrompt(
    project: string,
    episode: number,
  ): ExportGridPromptMutation;
  useRegenerateGrid(
    project: string,
    episode: number,
  ): RegenerateGridMutation;
  useUploadGrid(project: string, episode: number): UploadGridMutation;
}

export interface RenderGridCardControllerDependencies {
  copyText(text: string): void | Promise<void>;
  downloadFile(url: string, filename: string): void;
}

export interface RenderGridCardControllerOptions {
  cellAspect: string;
  episode: number;
  group: RenderGridGroup;
  project: string;
}

export interface RenderGridCardController {
  beatNumbers: number[];
  cellAspect: string;
  cellCount: number;
  cols: number;
  cutPending: boolean;
  exportPromptPending: boolean;
  gridIndex: number;
  gridUrl: string | null;
  promptOpen: boolean;
  promptText: string;
  regenerationPending: boolean;
  regenerationStarted: boolean;
  regenerationStopping: boolean;
  rows: number;
  uploadPending: boolean;
  onCopyPrompt(): Promise<void>;
  onCut(): Promise<void>;
  onDownload(): void;
  onExportPrompt(): Promise<void>;
  onPromptOpenChange(open: boolean): void;
  onRegenerate(): Promise<void>;
  onStopRegeneration(): Promise<void>;
  onUpload(file: File): Promise<void>;
}

export function createUseRenderGridGalleryController(
  queries: RenderGridGalleryControllerQueries,
) {
  return function useRenderGridGalleryController(
    options: RenderGridGalleryControllerOptions,
  ): RenderGridGalleryController {
    const { t } = useTranslation();
    const { data: gridsResponse } = queries.useGrids(
      options.project,
      options.episode,
    );
    const rebuildPoolIndex = queries.useRebuildPoolIndex(
      options.project,
      options.episode,
    );
    const groups = useMemo(
      () =>
        buildRenderGridGroups(
          gridsResponse?.data?.images ?? [],
          options.beats,
        ),
      [gridsResponse?.data?.images, options.beats],
    );

    const rebuild = async () => {
      try {
        const response = await rebuildPoolIndex.mutateAsync();
        toast.success(
          t("episode.workbench.renderGrid.rebuildSuccess", {
            count: response.data.image_count,
          }),
        );
      } catch {
        toast.error(t("episode.workbench.renderGrid.rebuildFailed"));
      }
    };

    return {
      gridCount: groups.length,
      groups,
      rebuildPending: rebuildPoolIndex.isPending,
      onRebuild: rebuild,
    };
  };
}

export function createUseRenderGridCardController(
  queries: RenderGridCardControllerQueries,
  dependencies: RenderGridCardControllerDependencies,
) {
  return function useRenderGridCardController(
    options: RenderGridCardControllerOptions,
  ): RenderGridCardController {
    const { t } = useTranslation();
    const regenerateGrid = queries.useRegenerateGrid(
      options.project,
      options.episode,
    );
    const cutGrid = queries.useCutGrid(options.project, options.episode);
    const uploadGrid = queries.useUploadGrid(options.project, options.episode);
    const exportGridPrompt = queries.useExportGridPrompt(
      options.project,
      options.episode,
    );
    const [promptOpen, setPromptOpen] = useState(false);
    const [promptText, setPromptText] = useState("");
    const scope = `grid_${options.group.gridIndex}`;
    const regenerationTask = useTaskController({
      key: {
        taskType: "grid_regenerate",
        project: options.project,
        episode: options.episode,
        scope,
      },
      invalidateKeys: [
        queryKeys.grids(options.project, options.episode),
        queryKeys.beats(options.project, options.episode),
        queryKeys.pipelineStatus(options.project),
      ],
    });
    const gridUrl = resolveMediaUrl(options.group.gridUrl);

    const regenerate = async () => {
      try {
        const response = await regenerateGrid.mutateAsync({
          gridIndex: options.group.gridIndex,
          sceneGrouping: true,
        });
        if (!response.ok) {
          toast.error(
            response.error || t("episode.workbench.renderGrid.regenFailed"),
          );
          return;
        }
        regenerationTask.start({ scope: response.scope ?? scope, taskId: response.task_id });
        toast.success(
          t("episode.workbench.renderGrid.regenStarted", {
            n: options.group.gridIndex,
          }),
        );
      } catch {
        toast.error(t("episode.workbench.renderGrid.regenFailed"));
      }
    };

    const cut = async () => {
      try {
        const response = await cutGrid.mutateAsync({
          gridIndex: options.group.gridIndex,
          rows: options.group.rows,
          cols: options.group.cols,
          modeKey: options.group.modeKey,
          beatNumbers: options.group.beatNumbers,
          gridType: "render",
        });
        if (!response.ok) {
          toast.error(
            response.error || t("episode.workbench.renderGrid.cutFailed"),
          );
          return;
        }
        toast.success(
          t("episode.workbench.renderGrid.cutSuccess", {
            n: options.group.gridIndex,
          }),
        );
      } catch {
        toast.error(t("episode.workbench.renderGrid.cutFailed"));
      }
    };

    const upload = async (file: File) => {
      try {
        const response = await uploadGrid.mutateAsync({
          gridIndex: options.group.gridIndex,
          file,
          gridType: "render",
          modeKey: options.group.modeKey,
          beatNumbers: options.group.beatNumbers,
        });
        if (!response.ok) {
          toast.error(
            response.error || t("episode.workbench.renderGrid.uploadFailed"),
          );
          return;
        }
        toast.success(
          t("episode.workbench.renderGrid.uploadSuccess", {
            n: options.group.gridIndex,
          }),
        );
      } catch {
        toast.error(t("episode.workbench.renderGrid.uploadFailed"));
      }
    };

    const exportPrompt = async () => {
      try {
        const response = await exportGridPrompt.mutateAsync({
          gridIndex: options.group.gridIndex,
          gridType: "render",
          modeKey: options.group.modeKey,
          beatNumbers: options.group.beatNumbers,
        });
        if (!response.ok) {
          toast.error(
            response.error || t("episode.workbench.renderGrid.promptFailed"),
          );
          return;
        }
        setPromptText(response.data.prompt);
        setPromptOpen(true);
      } catch {
        toast.error(t("episode.workbench.renderGrid.promptFailed"));
      }
    };

    const copyPrompt = async () => {
      await dependencies.copyText(promptText);
      toast.success(t("episode.workbench.renderGrid.copySuccess"));
    };

    return {
      beatNumbers: options.group.beatNumbers,
      cellAspect: options.cellAspect,
      cellCount: options.group.cells.length,
      cols: options.group.cols,
      cutPending: cutGrid.isPending,
      exportPromptPending: exportGridPrompt.isPending,
      gridIndex: options.group.gridIndex,
      gridUrl,
      promptOpen,
      promptText,
      regenerationPending: regenerateGrid.isPending,
      regenerationStarted: regenerationTask.started,
      regenerationStopping: regenerationTask.stopping,
      rows: options.group.rows,
      uploadPending: uploadGrid.isPending,
      onCopyPrompt: copyPrompt,
      onCut: cut,
      onDownload: () => {
        if (!gridUrl) return;
        dependencies.downloadFile(
          gridUrl,
          `render_grid_${options.group.gridIndex}.png`,
        );
      },
      onExportPrompt: exportPrompt,
      onPromptOpenChange: setPromptOpen,
      onRegenerate: regenerate,
      onStopRegeneration: regenerationTask.stop,
      onUpload: upload,
    };
  };
}
