// Copyright (c) 2026 AI anime
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useTaskController } from "@/modules/task_execution/public";
import { resolveMediaUrl } from "@/lib/media-url";
import { queryKeys } from "@/lib/query-keys";
import type {
  GridPromptResponse,
  GridSketchPreviewResponse,
  GridUploadResponse,
  ImagePoolResponse,
  ProductionErrorResponse,
  ProductionTaskResponse,
} from "@/modules/production/application/ports";
import type { SketchAspectRatio } from "@/modules/production/domain/image-settings";
import type { GenerateSketchesCommand } from "@/modules/production/domain/sketch-generation";
import {
  buildSketchGridGroups,
  type SketchGridBeat,
  type SketchGridGroup,
} from "@/modules/production/domain/sketch-grid-gallery";

interface SketchGridGalleryQuery {
  data?: ImagePoolResponse;
}

export interface SketchGridGalleryControllerQueries {
  useGrids(project: string, episode: number): SketchGridGalleryQuery;
}

export interface SketchGridGalleryControllerOptions {
  aspectRatio: SketchAspectRatio;
  beats?: SketchGridBeat[];
  episode: number;
  project: string;
}

export interface SketchGridGalleryController {
  gridCount: number;
  groups: SketchGridGroup[];
}

interface GenerateSketchesMutation {
  isPending: boolean;
  mutateAsync(
    command: GenerateSketchesCommand,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
}

interface UploadSketchGridMutation {
  isPending: boolean;
  mutateAsync(command: {
    beatNumbers: number[];
    file: File;
    gridIndex: number;
    gridType: "sketch";
    modeKey: string;
  }): Promise<GridUploadResponse>;
}

interface ExportSketchGridPromptMutation {
  isPending: boolean;
  mutateAsync(command: {
    beatNumbers: number[];
    gridIndex: number;
    gridType: "sketch";
    modeKey: string;
  }): Promise<GridPromptResponse>;
}

interface SketchGridPreviewQuery {
  data?: GridSketchPreviewResponse;
}

export interface SketchGridCardControllerQueries {
  useExportGridPrompt(
    project: string,
    episode: number,
  ): ExportSketchGridPromptMutation;
  useGenerateSketches(
    project: string,
    episode: number,
  ): GenerateSketchesMutation;
  useSketchGridPreview(
    project: string,
    episode: number,
    command: {
      beatNumbers: number[];
      cols: number;
      enabled: boolean;
      gridIndex: number;
      rows: number;
    },
  ): SketchGridPreviewQuery;
  useUploadGrid(
    project: string,
    episode: number,
  ): UploadSketchGridMutation;
}

export interface SketchGridCardControllerDependencies {
  copyText(text: string): void | Promise<void>;
  downloadFile(url: string, filename: string): void;
}

export interface SketchGridCardControllerOptions {
  aspectRatio: SketchAspectRatio;
  episode: number;
  group: SketchGridGroup;
  imageGenerationSelection?: string;
  project: string;
}

export interface SketchGridFallbackCellViewModel {
  beatNumber: number;
  url: string | null;
}

export interface SketchGridCardController {
  aspectRatio: SketchAspectRatio;
  beatNumbers: number[];
  cellCount: number;
  cols: number;
  exportPromptPending: boolean;
  fallbackCells: SketchGridFallbackCellViewModel[];
  generatedPreviewUrl: string | null;
  generationPending: boolean;
  generationStarted: boolean;
  generationStopping: boolean;
  gridIndex: number;
  gridUrl: string | null;
  promptOpen: boolean;
  promptText: string;
  rows: number;
  sceneId?: string;
  uploadPending: boolean;
  onCopyPrompt(): Promise<void>;
  onDownload(): void;
  onExportPrompt(): Promise<void>;
  onGenerate(): Promise<void>;
  onPromptOpenChange(open: boolean): void;
  onStopGeneration(): Promise<void>;
  onUpload(file: File): Promise<void>;
}

export function createUseSketchGridGalleryController(
  queries: SketchGridGalleryControllerQueries,
) {
  return function useSketchGridGalleryController(
    options: SketchGridGalleryControllerOptions,
  ): SketchGridGalleryController {
    const { data: gridsResponse } = queries.useGrids(
      options.project,
      options.episode,
    );
    const groups = useMemo(
      () =>
        buildSketchGridGroups(
          gridsResponse?.data?.images ?? [],
          options.beats,
          options.aspectRatio,
        ),
      [gridsResponse?.data?.images, options.aspectRatio, options.beats],
    );

    return {
      gridCount: groups.length,
      groups,
    };
  };
}

export function createUseSketchGridCardController(
  queries: SketchGridCardControllerQueries,
  dependencies: SketchGridCardControllerDependencies,
) {
  return function useSketchGridCardController(
    options: SketchGridCardControllerOptions,
  ): SketchGridCardController {
    const { t } = useTranslation();
    const generateSketches = queries.useGenerateSketches(
      options.project,
      options.episode,
    );
    const uploadGrid = queries.useUploadGrid(
      options.project,
      options.episode,
    );
    const exportGridPrompt = queries.useExportGridPrompt(
      options.project,
      options.episode,
    );
    const [promptOpen, setPromptOpen] = useState(false);
    const [promptText, setPromptText] = useState("");
    const scope = `grid_${options.group.gridIndex}`;
    const sketchTask = useTaskController({
      key: {
        taskType: "sketch_generation",
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
    const fallbackCells = (
      options.group.fallbackCells.length > 0
        ? options.group.fallbackCells
        : options.group.cells.map((cell) => ({
            beatNumber: cell.original_beat,
            url: cell.cell_url,
          }))
    ).map((cell) => ({
      ...cell,
      url: resolveMediaUrl(cell.url),
    }));
    const hasFallbackPreview = fallbackCells.some((cell) => cell.url);
    const sketchPreview = queries.useSketchGridPreview(
      options.project,
      options.episode,
      {
        gridIndex: options.group.gridIndex,
        rows: options.group.rows,
        cols: options.group.cols,
        beatNumbers: options.group.beatNumbers,
        enabled: !gridUrl && !hasFallbackPreview,
      },
    );
    const generatedPreviewUrl =
      sketchPreview.data?.ok === true
        ? resolveMediaUrl(sketchPreview.data.data.previewUrl)
        : null;

    const generate = async () => {
      try {
        const response = await generateSketches.mutateAsync({
          gridIndex: options.group.gridIndex,
          sketchSceneGrouping: true,
          aspectRatio: options.aspectRatio,
          replaceExisting: true,
          ...(options.imageGenerationSelection
            ? {
                imageGenerationSelection:
                  options.imageGenerationSelection,
              }
            : {}),
        });
        if (!response.ok) {
          toast.error(
            response.error || t("episode.workbench.sketchGrid.regenFailed"),
          );
          return;
        }
        sketchTask.start({ scope });
        toast.success(
          t("episode.workbench.sketchGrid.regenStarted", {
            n: options.group.gridIndex,
          }),
        );
      } catch {
        toast.error(t("episode.workbench.sketchGrid.regenFailed"));
      }
    };

    const upload = async (file: File) => {
      try {
        const response = await uploadGrid.mutateAsync({
          gridIndex: options.group.gridIndex,
          file,
          gridType: "sketch",
          modeKey: options.group.modeKey,
          beatNumbers: options.group.beatNumbers,
        });
        if (!response.ok) {
          toast.error(
            response.error || t("episode.workbench.sketchGrid.uploadFailed"),
          );
          return;
        }
        toast.success(
          t("episode.workbench.sketchGrid.uploadSuccess", {
            n: options.group.gridIndex,
          }),
        );
      } catch {
        toast.error(t("episode.workbench.sketchGrid.uploadFailed"));
      }
    };

    const exportPrompt = async () => {
      try {
        const response = await exportGridPrompt.mutateAsync({
          gridIndex: options.group.gridIndex,
          gridType: "sketch",
          modeKey: options.group.modeKey,
          beatNumbers: options.group.beatNumbers,
        });
        if (!response.ok) {
          toast.error(
            response.error || t("episode.workbench.sketchGrid.promptFailed"),
          );
          return;
        }
        setPromptText(response.data.prompt);
        setPromptOpen(true);
      } catch {
        toast.error(t("episode.workbench.sketchGrid.promptFailed"));
      }
    };

    const copyPrompt = async () => {
      await dependencies.copyText(promptText);
      toast.success(t("episode.workbench.sketchGrid.copySuccess"));
    };

    return {
      aspectRatio: options.aspectRatio,
      beatNumbers: options.group.beatNumbers,
      cellCount: options.group.cells.length,
      cols: options.group.cols,
      exportPromptPending: exportGridPrompt.isPending,
      fallbackCells,
      generatedPreviewUrl,
      generationPending: generateSketches.isPending,
      generationStarted: sketchTask.started,
      generationStopping: sketchTask.stopping,
      gridIndex: options.group.gridIndex,
      gridUrl,
      promptOpen,
      promptText,
      rows: options.group.rows,
      sceneId: options.group.sceneId,
      uploadPending: uploadGrid.isPending,
      onCopyPrompt: copyPrompt,
      onDownload: () => {
        if (!gridUrl) return;
        dependencies.downloadFile(
          gridUrl,
          `sketch_grid_${options.group.gridIndex}.png`,
        );
      },
      onExportPrompt: exportPrompt,
      onGenerate: generate,
      onPromptOpenChange: setPromptOpen,
      onStopGeneration: sketchTask.stop,
      onUpload: upload,
    };
  };
}
