// Copyright (c) 2026 AI anime
import type { DirectorStageManifest } from "@/features/viewer-kit/public";
import type { AssetResponse } from "@/modules/asset_world/application/ports";
import type {
  BeatBackgroundAnchorCropCommand,
  BeatBackgroundAnchors,
  DirectorControlFrameStatus,
} from "@/modules/asset_world/domain/beat-viewer";

export interface BeatViewerGateway {
  getDirectorStageManifest(
    project: string,
    episode: number,
    beatNumber: number,
    signal?: AbortSignal,
  ): Promise<AssetResponse<DirectorStageManifest>>;
  getBackgroundAnchors(
    project: string,
    episode: number,
    beatNumber: number,
    signal?: AbortSignal,
  ): Promise<AssetResponse<BeatBackgroundAnchors>>;
  updateBackgroundAnchor(
    project: string,
    episode: number,
    beatNumber: number,
    anchorId: string,
  ): Promise<AssetResponse<BeatBackgroundAnchors>>;
  uploadBackgroundAnchor(
    project: string,
    episode: number,
    beatNumber: number,
    file: File,
  ): Promise<AssetResponse<BeatBackgroundAnchors>>;
  cropBackgroundAnchor(
    project: string,
    episode: number,
    beatNumber: number,
    command: BeatBackgroundAnchorCropCommand,
  ): Promise<AssetResponse<BeatBackgroundAnchors>>;
  getDirectorControlFrameStatus(
    project: string,
    episode: number,
    beatNumber: number,
    signal?: AbortSignal,
  ): Promise<AssetResponse<DirectorControlFrameStatus>>;
}
