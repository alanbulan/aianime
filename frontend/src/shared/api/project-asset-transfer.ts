// Copyright (c) 2026 AI anime
import { apiCall, apiRequest } from "@/shared/api/client";

export interface ProjectAssetUploadOptions {
  readonly disableTimeout?: boolean;
}

export interface ProjectAssetUploadResult {
  readonly url: string;
  readonly filename: string;
  readonly size: number;
}

export async function uploadProjectAsset(params: {
  projectId: string;
  file: File | Blob;
  filename: string;
  options?: ProjectAssetUploadOptions;
}): Promise<ProjectAssetUploadResult> {
  const formData = new FormData();
  formData.append("file", params.file, params.filename);
  const response = await apiRequest(
    `projects/${encodeURIComponent(params.projectId)}/freezone/upload`,
    {
      method: "POST",
      body: formData,
      timeout: params.options?.disableTimeout ? false : undefined,
    },
  ).json<{
    ok: boolean;
    data?: ProjectAssetUploadResult;
    error?: string;
  }>();
  if (!response.ok || !response.data) {
    throw new Error(response.error ?? "upload failed");
  }
  return response.data;
}

export function commitProjectAsset<TResult, TTarget extends object>(params: {
  projectId: string;
  sourceUrl: string;
  target: TTarget;
  markStale?: boolean;
}): Promise<TResult> {
  return apiCall<TResult>(
    `projects/${encodeURIComponent(params.projectId)}/freezone/push`,
    {
      method: "POST",
      json: {
        source_url: params.sourceUrl,
        target: params.target,
        mark_stale: params.markStale ?? false,
      },
    },
  );
}

export function getProjectAssetImpact<TResult, TTarget extends object>(params: {
  projectId: string;
  target: TTarget;
}): Promise<TResult> {
  return apiCall<TResult>(
    `projects/${encodeURIComponent(params.projectId)}/freezone/impact`,
    { method: "POST", json: { target: params.target } },
  );
}
