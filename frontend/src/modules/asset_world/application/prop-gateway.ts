// Copyright (c) 2026 AI anime
import type {
  AssetDataResponse,
  AssetErrorResponse,
  AssetResponse,
  AssetTaskResponse,
} from "@/modules/asset_world/application/ports";
import type { PropAsset } from "@/modules/asset_world/domain/prop";

export interface PropPayload {
  name: string;
  aliases?: string[];
  prop_type?: string;
  visual_prompt?: string;
  description?: string;
  owner?: string;
  notes?: string;
}

export interface PropGateway {
  listProps(
    project: string,
    signal?: AbortSignal,
  ): Promise<AssetDataResponse<PropAsset[]>>;
  createProp(
    project: string,
    input: PropPayload,
  ): Promise<AssetResponse<PropAsset>>;
  updateProp(
    project: string,
    name: string,
    input: Partial<PropPayload>,
  ): Promise<AssetResponse<PropAsset>>;
  deleteProp(
    project: string,
    name: string,
  ): Promise<AssetResponse<{ deleted: boolean }>>;
  scheduleReference(
    project: string,
    name: string,
    input: { model?: string } | void,
  ): Promise<AssetTaskResponse | AssetErrorResponse>;
  uploadReference(
    project: string,
    name: string,
    file: File,
  ): Promise<AssetResponse<unknown>>;
  scheduleBatchReferences(
    project: string,
    input: { model?: string } | void,
  ): Promise<AssetTaskResponse | AssetErrorResponse>;
}
