// Copyright (c) 2026 AI anime
import { dataUrlToBlob } from "@/shared/media/data-url";

import type { FreezoneAssetUploadGateway } from "./assetUpload";

export interface CanvasImageSourcePreparationGateway {
  prepare(projectId: string, rawUrl: string): Promise<string>;
}

export interface PrepareCanvasImageSourceParams {
  readonly projectId: string;
  readonly rawUrl: string;
}

export interface PrepareCanvasImageSourcesParams {
  readonly projectId: string;
  readonly rawUrls: readonly string[] | null | undefined;
}

export interface PrepareCanvasImageSourceDependencies {
  readonly uploadGateway: FreezoneAssetUploadGateway;
  readonly now: () => number;
}

function extensionForMime(mime: string): string {
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "png";
}

function stripQuery(url: string): string {
  return url.split("?")[0];
}

export async function prepareCanvasImageSource(
  params: PrepareCanvasImageSourceParams,
  dependencies: PrepareCanvasImageSourceDependencies,
): Promise<string> {
  if (!params.rawUrl.startsWith("data:")) {
    return stripQuery(params.rawUrl);
  }
  const file = dataUrlToBlob(params.rawUrl);
  const uploaded = await dependencies.uploadGateway.upload({
    projectId: params.projectId,
    file,
    filename: `paste-${dependencies.now()}.${extensionForMime(file.type)}`,
  });
  return stripQuery(uploaded.url);
}

export async function prepareCanvasImageSources(
  params: PrepareCanvasImageSourcesParams,
  dependencies: PrepareCanvasImageSourceDependencies,
): Promise<string[]> {
  const sources = (params.rawUrls ?? []).filter(
    (url): url is string => typeof url === "string" && url.trim().length > 0,
  );
  return await Promise.all(
    sources.map((rawUrl) =>
      prepareCanvasImageSource(
        { projectId: params.projectId, rawUrl },
        dependencies,
      ),
    ),
  );
}
