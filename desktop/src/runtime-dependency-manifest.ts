// Copyright (c) 2026 AI anime

import { COMMERCIAL_RUNTIME_DEPENDENCIES_URL } from "./commercial-api-client.js";

export type RuntimeDependencyId = "world" | "worldModels" | "matte";

export function runtimeDependencyManifestUrl(
  id: RuntimeDependencyId,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  environment: NodeJS.ProcessEnv = process.env,
  version?: string,
): string {
  const override = environment.AI_ANIME_RUNTIME_MANIFEST_URL?.trim();
  const base = environment.AI_ANIME_RUNTIME_DOWNLOAD_BASE_URL?.trim().replace(/\/+$/u, "")
    || COMMERCIAL_RUNTIME_DEPENDENCIES_URL;
  const url = new URL(override
    ? override.replaceAll("{id}", id).replaceAll("{platform}", platform).replaceAll("{arch}", arch)
    : `${base}/${id}/${platform}-${arch}/manifest.json`);
  if (version) url.searchParams.set("version", version);
  return url.href;
}

export async function fetchRuntimeDependencyManifest(
  id: RuntimeDependencyId,
  platform: NodeJS.Platform,
  arch: string,
  fetchImpl: typeof fetch,
  version?: string,
): Promise<unknown> {
  const response = await fetchImpl(runtimeDependencyManifestUrl(id, platform, arch, process.env, version), {
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) throw new Error(`依赖清单获取失败（HTTP ${response.status}）`);
  return await response.json();
}
