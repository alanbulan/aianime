// Copyright (c) 2026 AI anime
import type { Style } from "@/modules/asset_world/domain/style";

export interface AssetDataResponse<T> {
  ok: true;
  data: T;
}

export interface AssetErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

export type AssetResponse<T> = AssetDataResponse<T> | AssetErrorResponse;

export interface CreateStyleInput {
  id: string;
  name: string;
  project: string;
  config: Record<string, unknown>;
  preview_path?: string | null;
}

export interface AssetWorldGateway {
  listStyles(
    project?: string,
    signal?: AbortSignal,
  ): Promise<AssetDataResponse<Style[]>>;
  getStyle(
    project: string,
    styleId: string,
    signal?: AbortSignal,
  ): Promise<AssetDataResponse<Style>>;
  createStyle(input: CreateStyleInput): Promise<AssetResponse<{ id: string }>>;
  deleteStyle(
    styleId: string,
    project?: string,
  ): Promise<AssetDataResponse<unknown>>;
  analyzeStyle(
    project: string,
    file: File,
  ): Promise<AssetResponse<Record<string, unknown>>>;
  uploadStylePreview(
    project: string,
    input: { file: File; styleId: string },
  ): Promise<AssetResponse<{ preview_path: string }>>;
}
