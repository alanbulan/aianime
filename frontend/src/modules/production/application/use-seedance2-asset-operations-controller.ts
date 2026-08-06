// Copyright (c) 2026 AI anime
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { CropBox } from "@/shared/aspect-ratio";
import { isProductionErrorResponse } from "@/modules/production/application/ports";
import type { Seedance2CropIntent } from "@/modules/production/domain/seedance2-crop";
import type {
  Seedance2AssetItem,
  VideoInputCropTarget,
} from "@/modules/production/domain/seedance2-panel";

interface Mutation<TCommand> {
  isPending: boolean;
  mutateAsync(command: TCommand): Promise<unknown>;
}

export interface Seedance2AssetOperationQueries {
  useUploadSeedance2Asset(
    project: string,
    episode: number,
  ): Mutation<{ beatNum: number; file: File }>;
  useDeleteSeedance2Asset(
    project: string,
    episode: number,
  ): Mutation<{
    beatNum: number;
    mediaKind: "images" | "audios";
    path: string;
  }>;
  useCropSeedance2Asset(
    project: string,
    episode: number,
  ): Mutation<{
    beatNum: number;
    assetKey: string;
    sourcePath: string;
    target: VideoInputCropTarget;
    crop: CropBox;
  }>;
  useTrimSeedance2Asset(
    project: string,
    episode: number,
  ): Mutation<{
    beatNum: number;
    assetKey: string;
    sourcePath: string;
    startSeconds: number;
    durationSeconds: number;
  }>;
}

export interface Seedance2AssetOperationsControllerOptions {
  beatNumber: number;
  episode: number;
  project: string;
}

export interface Seedance2AssetOperationsController {
  cropIntent: Seedance2CropIntent | null;
  cropPending: boolean;
  deletePending: boolean;
  trimAsset: Seedance2AssetItem | null;
  trimDuration: string;
  trimPending: boolean;
  trimStart: string;
  uploadPending: boolean;
  closeCrop(): void;
  closeTrim(): void;
  deleteAsset(asset: Seedance2AssetItem): Promise<void>;
  openCrop(intent: Seedance2CropIntent): void;
  openTrim(asset: Seedance2AssetItem): void;
  saveCrop(
    asset: Seedance2AssetItem,
    target: VideoInputCropTarget,
    crop: CropBox,
  ): Promise<void>;
  saveTrim(): Promise<void>;
  setTrimDuration(value: string): void;
  setTrimStart(value: string): void;
  uploadAsset(file: File): Promise<void>;
}

export function createUseSeedance2AssetOperationsController(
  queries: Seedance2AssetOperationQueries,
) {
  return function useSeedance2AssetOperationsController(
    options: Seedance2AssetOperationsControllerOptions,
  ): Seedance2AssetOperationsController {
    const { t } = useTranslation();
    const upload = queries.useUploadSeedance2Asset(
      options.project,
      options.episode,
    );
    const remove = queries.useDeleteSeedance2Asset(
      options.project,
      options.episode,
    );
    const cropMutation = queries.useCropSeedance2Asset(
      options.project,
      options.episode,
    );
    const trim = queries.useTrimSeedance2Asset(
      options.project,
      options.episode,
    );
    const [cropIntent, setCropIntent] =
      useState<Seedance2CropIntent | null>(null);
    const [trimAsset, setTrimAsset] = useState<Seedance2AssetItem | null>(null);
    const [trimStart, setTrimStart] = useState("0");
    const [trimDuration, setTrimDuration] = useState("4");

    const showResponseError = (response: unknown): boolean => {
      if (!isProductionErrorResponse(response)) return false;
      toast.error(response.error || t("common.error"));
      return true;
    };

    const uploadAsset = async (file: File) => {
      try {
        const response = await upload.mutateAsync({
          beatNum: options.beatNumber,
          file,
        });
        if (showResponseError(response)) return;
        toast.success(t("episode.workbench.video.seedance2AssetUploaded"));
      } catch {
        toast.error(t("common.error"));
      }
    };

    const deleteAsset = async (asset: Seedance2AssetItem) => {
      const path = asset.abs_path || asset.path || "";
      if (!path) return;
      try {
        const response = await remove.mutateAsync({
          beatNum: options.beatNumber,
          mediaKind: asset.media_type === "audio" ? "audios" : "images",
          path,
        });
        if (showResponseError(response)) return;
        toast.success(t("episode.workbench.video.seedance2AssetDeleted"));
      } catch {
        toast.error(t("common.error"));
      }
    };

    const saveCrop = async (
      asset: Seedance2AssetItem,
      target: VideoInputCropTarget,
      crop: CropBox,
    ) => {
      const sourcePath =
        asset.crop_source_abs_path ||
        asset.crop_source_path ||
        asset.abs_path ||
        asset.path ||
        "";
      if (!sourcePath) return;
      try {
        const response = await cropMutation.mutateAsync({
          beatNum: options.beatNumber,
          assetKey: asset.key,
          sourcePath,
          target,
          crop,
        });
        if (showResponseError(response)) return;
        toast.success(t("episode.workbench.video.seedance2AssetCropped"));
        setCropIntent(null);
      } catch {
        toast.error(t("common.error"));
      }
    };

    const saveTrim = async () => {
      if (!trimAsset) return;
      const sourcePath = trimAsset.abs_path || trimAsset.path || "";
      if (!sourcePath) return;
      const startSeconds = Number(trimStart);
      const durationSeconds = Number(trimDuration);
      if (
        !Number.isFinite(startSeconds) ||
        !Number.isFinite(durationSeconds) ||
        durationSeconds <= 0
      ) {
        toast.error(
          t("episode.workbench.video.seedance2AssetAudioTrimInvalid"),
        );
        return;
      }
      try {
        const response = await trim.mutateAsync({
          beatNum: options.beatNumber,
          assetKey: trimAsset.key,
          sourcePath,
          startSeconds,
          durationSeconds,
        });
        if (showResponseError(response)) return;
        toast.success(t("episode.workbench.video.seedance2AssetAudioTrimmed"));
        setTrimAsset(null);
      } catch {
        toast.error(t("common.error"));
      }
    };

    return {
      cropIntent,
      cropPending: cropMutation.isPending,
      deletePending: remove.isPending,
      trimAsset,
      trimDuration,
      trimPending: trim.isPending,
      trimStart,
      uploadPending: upload.isPending,
      closeCrop: () => setCropIntent(null),
      closeTrim: () => setTrimAsset(null),
      deleteAsset,
      openCrop: setCropIntent,
      openTrim: (asset) => {
        setTrimStart("0");
        setTrimDuration("4");
        setTrimAsset(asset);
      },
      saveCrop,
      saveTrim,
      setTrimDuration,
      setTrimStart,
      uploadAsset,
    };
  };
}
