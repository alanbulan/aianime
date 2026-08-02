// Copyright (c) 2026 AI anime
import type { PushResult, PushTarget } from "../domain/assetCommit";

export type DirectorRenderTarget = Extract<
  PushTarget,
  { kind: "director_render" }
>;

export interface DirectorRenderCanvasCommitSource {
  sourceUrl: string;
  previewUrl?: string | null;
  bundle?: Record<string, unknown> | null;
  sourceNodeId?: string | null;
  label?: string | null;
}

export interface CommitDirectorRenderParams {
  projectId: string;
  target: DirectorRenderTarget;
  source: DirectorRenderCanvasCommitSource;
}

export interface SaveDirectorControlFrameParams {
  projectId: string;
  episode: number;
  beat: number;
  payload: Record<string, unknown>;
}

export interface DirectorControlFrameSaveResult {
  combinedPath?: string | null;
  combinedUrl?: string | null;
}

export interface DirectorRenderCommitGateway {
  loadJsonRecord(url: string): Promise<Record<string, unknown>>;
  loadPngDataUrl(url: string): Promise<string>;
  saveControlFrame(
    params: SaveDirectorControlFrameParams,
  ): Promise<DirectorControlFrameSaveResult>;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function completeBundleParts(bundle: Record<string, unknown> | null | undefined) {
  const relPaths = recordValue(bundle?.rel_paths);
  const urls = recordValue(bundle?.urls);
  const combinedUrl = stringValue(urls?.combined);
  const envOnlyUrl = stringValue(urls?.env_only);
  const frameMetaUrl = stringValue(urls?.frame_meta);
  if (!combinedUrl || !envOnlyUrl || !frameMetaUrl) {
    return null;
  }
  return {
    combinedRelPath: stringValue(relPaths?.combined),
    combinedUrl,
    envOnlyUrl,
    frameMetaUrl,
  };
}

function manualFrameMeta(
  source: DirectorRenderCanvasCommitSource,
): Record<string, unknown> {
  const sourceId = source.sourceNodeId
    ? `manual_canvas_commit:${source.sourceNodeId}`
    : "manual_canvas_commit";
  return {
    schema_version: "director_frame_meta_v1",
    source: {
      source_id: sourceId,
      source_type: "sog",
      source_kind: "custom",
      label: source.label || "画布手动提交",
      url: source.sourceUrl,
    },
    camera: {
      mode: "sog",
      frame_aspect: "16:9",
      state: {},
    },
    layer: {
      source_id: sourceId,
      actors: [],
      props: [],
      stagings: [],
    },
    commit_source: "manual_canvas_commit",
  };
}

export async function commitDirectorRenderFromCanvasSource(
  params: CommitDirectorRenderParams,
  gateway: DirectorRenderCommitGateway,
): Promise<PushResult> {
  const { projectId, target, source } = params;
  const bundle = recordValue(source.bundle);
  const parts = completeBundleParts(bundle);
  const frameMetaRecord: Record<string, unknown> = parts
    ? recordValue(bundle?.frame_meta) ??
      await gateway.loadJsonRecord(parts.frameMetaUrl)
    : manualFrameMeta(source);
  const combinedDataUrl = parts
    ? await gateway.loadPngDataUrl(parts.combinedUrl)
    : await gateway.loadPngDataUrl(source.sourceUrl);
  const envOnlyDataUrl = parts
    ? await gateway.loadPngDataUrl(parts.envOnlyUrl)
    : combinedDataUrl;

  const result = await gateway.saveControlFrame({
    projectId,
    episode: target.episode,
    beat: target.beat,
    payload: {
      frame_aspect: stringValue(frameMetaRecord.frame_aspect) ||
        stringValue(recordValue(frameMetaRecord.camera)?.frame_aspect) ||
        "16:9",
      source: recordValue(frameMetaRecord.source) ??
        recordValue(bundle?.source) ??
        undefined,
      frame_meta: frameMetaRecord,
      images: {
        combined: combinedDataUrl,
        env_only: envOnlyDataUrl,
      },
    },
  });

  const targetPath = stringValue(result.combinedPath) ||
    parts?.combinedRelPath ||
    "";
  const targetUrl = stringValue(result.combinedUrl);
  if (!targetPath || !targetUrl) {
    throw new Error("导演合成图写入后缺少目标路径");
  }
  return {
    target_path: targetPath,
    target_url: targetUrl,
    backup: null,
  };
}
