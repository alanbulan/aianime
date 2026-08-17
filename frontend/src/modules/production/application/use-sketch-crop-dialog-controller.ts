// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  centerCropBoxForRatio,
  clampCropBox,
  zoomCropBox,
} from "@/shared/aspect-ratio";
import type {
  ProductionDataResponse,
  ProductionErrorResponse,
} from "@/modules/production/application/ports";
import type {
  CropSketchCommand,
  SketchCrop,
  SketchCropResult,
  SketchCropSourceData,
} from "@/modules/production/domain/sketch-pose-editor";

interface SketchCropSourceQuery {
  data?:
    | ProductionDataResponse<SketchCropSourceData>
    | ProductionErrorResponse;
  dataUpdatedAt?: number;
  error?: unknown;
  isError: boolean;
  isLoading?: boolean;
  refetch?(): Promise<unknown>;
}

interface CropSketchMutation {
  isPending: boolean;
  mutateAsync(
    command: CropSketchCommand,
  ): Promise<
    ProductionDataResponse<SketchCropResult> | ProductionErrorResponse
  >;
}

export interface SketchCropDialogControllerQueries {
  useCropSketch(project: string, episode: number): CropSketchMutation;
  useSketchCropSource(
    project: string,
    episode: number,
    beatNum: number,
    enabled: boolean,
  ): SketchCropSourceQuery;
}

export interface SketchCropDialogControllerDependencies {
  cacheBustImage(
    imageUrl: string,
    token: string | number | null | undefined,
  ): string;
  resolveMediaUrl(value: string): string | null;
  useProjectAspectRatio(project: string): {
    spec: { label: string; ratioValue: number };
  };
}

export interface SketchCropDialogControllerOptions {
  beatNum: number;
  episode: number;
  open: boolean;
  project: string;
  onOpenChange(open: boolean): void;
}

export interface SketchCropDialogController {
  aspectLabel: string;
  beatNum: number;
  crop: SketchCrop;
  data: SketchCropSourceData | null;
  loadError: string | null;
  open: boolean;
  savePending: boolean;
  sketchUrl: string;
  onMoveDrag(
    clientX: number,
    clientY: number,
    displayWidth: number,
    displayHeight: number,
  ): void;
  onOpenChange(open: boolean): void;
  onRetry(): void;
  onSave(): void;
  onStartDrag(clientX: number, clientY: number): void;
  onStopDrag(): void;
  onZoom(scale: number): void;
}

interface CropDragState {
  clientX: number;
  clientY: number;
  crop: SketchCrop;
}

export function createUseSketchCropDialogController(
  queries: SketchCropDialogControllerQueries,
  dependencies: SketchCropDialogControllerDependencies,
) {
  return function useSketchCropDialogController({
    beatNum,
    episode,
    open,
    project,
    onOpenChange,
  }: SketchCropDialogControllerOptions): SketchCropDialogController {
    const { t } = useTranslation();
    const { spec } = dependencies.useProjectAspectRatio(project);
    const sourceQuery = queries.useSketchCropSource(
      project,
      episode,
      beatNum,
      open,
    );
    const cropSketch = queries.useCropSketch(project, episode);
    const data = sourceQuery.data?.ok ? sourceQuery.data.data : null;
    const dragRef = useRef<CropDragState | null>(null);
    const [crop, setCrop] = useState<SketchCrop>({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });

    useEffect(() => {
      if (!data || !open) return;
      setCrop(centerCropBoxForRatio(data.width, data.height, spec.ratioValue));
    }, [data?.height, data?.width, open, spec.ratioValue]);

    const onMoveDrag = useCallback(
      (
        clientX: number,
        clientY: number,
        displayWidth: number,
        displayHeight: number,
      ) => {
        const drag = dragRef.current;
        if (!drag || !data || displayWidth <= 0 || displayHeight <= 0) return;

        const scaleX = data.width / displayWidth;
        const scaleY = data.height / displayHeight;
        setCrop(
          clampCropBox(
            {
              ...drag.crop,
              x: drag.crop.x + (clientX - drag.clientX) * scaleX,
              y: drag.crop.y + (clientY - drag.clientY) * scaleY,
            },
            data.width,
            data.height,
          ),
        );
      },
      [data],
    );

    const onZoom = useCallback(
      (scale: number) => {
        if (!data) return;
        setCrop((current) =>
          zoomCropBox(current, data.width, data.height, scale),
        );
      },
      [data],
    );

    const save = async () => {
      try {
        const response = await cropSketch.mutateAsync({ beatNum, crop });
        if (!response.ok) {
          toast.error(response.error || t("common.error"));
          return;
        }
        toast.success(t("episode.workbench.sketch.cropSaved"));
        onOpenChange(false);
      } catch {
        toast.error(t("common.error"));
      }
    };

    const sketchUrl = data?.sketch_url
      ? dependencies.cacheBustImage(
          dependencies.resolveMediaUrl(data.sketch_url) ?? data.sketch_url,
          sourceQuery.dataUpdatedAt,
        )
      : "";
    const loadError =
      sourceQuery.data && !sourceQuery.data.ok
        ? sourceQuery.data.error || t("common.error")
        : !data && sourceQuery.error instanceof Error
          ? sourceQuery.error.message
          : !data && sourceQuery.isError
            ? t("common.error")
            : null;

    return {
      aspectLabel: spec.label,
      beatNum,
      crop,
      data,
      loadError,
      open,
      savePending: cropSketch.isPending,
      sketchUrl,
      onMoveDrag,
      onOpenChange,
      onRetry: () => {
        void sourceQuery.refetch?.();
      },
      onSave: () => {
        void save();
      },
      onStartDrag: (clientX, clientY) => {
        dragRef.current = { clientX, clientY, crop };
      },
      onStopDrag: () => {
        dragRef.current = null;
      },
      onZoom,
    };
  };
}
