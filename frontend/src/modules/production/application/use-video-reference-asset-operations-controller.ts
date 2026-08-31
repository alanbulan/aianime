// Copyright (c) 2026 AI anime
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { CropBox } from "@/shared/aspect-ratio";
import { isProductionErrorResponse } from "@/modules/production/application/ports";
import type { VideoReferenceCropIntent } from "@/modules/production/domain/video-reference-crop";
import type {
  VideoReferenceAssetItem,
  VideoInputCropTarget,
} from "@/modules/production/domain/video-reference-panel";

interface Mutation<TCommand> {
  isPending: boolean;
  mutateAsync(command: TCommand): Promise<unknown>;
}

export interface VideoReferenceAssetOperationQueries {
  useUploadVideoReferenceAsset(
    project: string,
    episode: number,
  ): Mutation<{ beatNum: number; file: File }>;
  useDeleteVideoReferenceAsset(
    project: string,
    episode: number,
  ): Mutation<{
    beatNum: number;
    mediaKind: "images" | "audios";
    path: string;
  }>;
  useCropVideoReferenceAsset(
    project: string,
    episode: number,
  ): Mutation<{
    beatNum: number;
    assetKey: string;
    sourcePath: string;
    target: VideoInputCropTarget;
    crop: CropBox;
  }>;
  useTrimVideoReferenceAsset(
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

export interface VideoReferenceAssetOperationsControllerOptions {
  beatNumber: number;
  episode: number;
  project: string;
}

export interface VideoReferenceAssetOperationsController {
  cropIntent: VideoReferenceCropIntent | null;
  cropPending: boolean;
  deletePending: boolean;
  trimAsset: VideoReferenceAssetItem | null;
  trimDuration: string;
  trimPending: boolean;
  trimStart: string;
  uploadPending: boolean;
  closeCrop(): void;
  closeTrim(): void;
  deleteAsset(asset: VideoReferenceAssetItem): Promise<void>;
  openCrop(intent: VideoReferenceCropIntent): void;
  openTrim(asset: VideoReferenceAssetItem): void;
  saveCrop(
    asset: VideoReferenceAssetItem,
    target: VideoInputCropTarget,
    crop: CropBox,
  ): Promise<void>;
  saveTrim(): Promise<void>;
  setTrimDuration(value: string): void;
  setTrimStart(value: string): void;
  uploadAsset(file: File): Promise<void>;
}

export function createUseVideoReferenceAssetOperationsController(
  queries: VideoReferenceAssetOperationQueries,
) {
  return function useVideoReferenceAssetOperationsController(
    options: VideoReferenceAssetOperationsControllerOptions,
  ): VideoReferenceAssetOperationsController {
    const { t } = useTranslation();
    const upload = queries.useUploadVideoReferenceAsset(
      options.project,
      options.episode,
    );
    const remove = queries.useDeleteVideoReferenceAsset(
      options.project,
      options.episode,
    );
    const cropMutation = queries.useCropVideoReferenceAsset(
      options.project,
      options.episode,
    );
    const trim = queries.useTrimVideoReferenceAsset(
      options.project,
      options.episode,
    );
    const [cropIntent, setCropIntent] =
      useState<VideoReferenceCropIntent | null>(null);
    const [trimAsset, setTrimAsset] = useState<VideoReferenceAssetItem | null>(null);
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
        toast.success(t("episode.workbench.video.videoReferenceAssetUploaded"));
      } catch {
        toast.error(t("common.error"));
      }
    };

    const deleteAsset = async (asset: VideoReferenceAssetItem) => {
      const path = asset.abs_path || asset.path || "";
      if (!path) return;
      try {
        const response = await remove.mutateAsync({
          beatNum: options.beatNumber,
          mediaKind: asset.media_type === "audio" ? "audios" : "images",
          path,
        });
        if (showResponseError(response)) return;
        toast.success(t("episode.workbench.video.videoReferenceAssetDeleted"));
      } catch {
        toast.error(t("common.error"));
      }
    };

    const saveCrop = async (
      asset: VideoReferenceAssetItem,
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
        toast.success(t("episode.workbench.video.videoReferenceAssetCropped"));
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
          t("episode.workbench.video.videoReferenceAssetAudioTrimInvalid"),
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
        toast.success(t("episode.workbench.video.videoReferenceAssetAudioTrimmed"));
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
