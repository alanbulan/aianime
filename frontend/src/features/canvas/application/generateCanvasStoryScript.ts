// Copyright (c) 2026 AI anime
import {
  isAudioNode,
  isExportImageNode,
  isImageEditNode,
  isImageGenNode,
  isTextAnnotationNode,
  isUploadNode,
  isVideoNode,
  type CanvasNode,
} from "../domain/canvasNodes";
import type {
  CanvasGenerationTaskGateway,
  CanvasGenerationTaskRef,
  CanvasStoryScriptResult,
} from "./ports";

export const STORY_SCRIPT_SOURCE_REQUIRED_MESSAGE =
  "请输入提示词描述剧情（视频 / 角色图片仅作参考）";

export type CanvasStoryScriptReferenceKind =
  | "text"
  | "image"
  | "video"
  | "audio";

export interface CanvasStoryScriptReference {
  readonly nodeId: string;
  readonly kind: CanvasStoryScriptReferenceKind;
  readonly thumbUrl?: string | null;
  readonly text?: string | null;
  readonly videoUrl?: string | null;
  readonly durationSec?: number | null;
  readonly displayName?: string | null;
}

export interface CanvasStoryScriptCharacterReference {
  readonly imageUrl: string;
  readonly name?: string;
}

export interface CanvasStoryScriptCommand {
  readonly sourceText: string;
  readonly model?: string;
  readonly videoUrl?: string;
  readonly durationSec?: number;
  readonly characterRefs?: CanvasStoryScriptCharacterReference[];
  readonly prompt?: string;
  readonly canvasId: string;
  readonly nodeId: string;
}

export interface BuildCanvasStoryScriptCommandParams {
  readonly references: ReadonlyArray<CanvasStoryScriptReference>;
  readonly prompt: string;
  readonly canvasId: string;
  readonly nodeId: string;
}

export function classifyCanvasStoryScriptReference(
  node: CanvasNode,
): CanvasStoryScriptReference | null {
  if (isTextAnnotationNode(node)) {
    return {
      nodeId: node.id,
      kind: "text",
      text: typeof node.data.content === "string" ? node.data.content : "",
      displayName: node.data.displayName ?? null,
    };
  }
  if (isVideoNode(node)) {
    const videoUrl =
      typeof node.data.videoUrl === "string" && node.data.videoUrl.length > 0
        ? node.data.videoUrl
        : null;
    const thumbUrl =
      (typeof node.data.previewImageUrl === "string" &&
        node.data.previewImageUrl) ||
      null;
    const durationSec =
      typeof node.data.durationMs === "number" && node.data.durationMs > 0
        ? node.data.durationMs / 1000
        : null;
    return {
      nodeId: node.id,
      kind: "video",
      thumbUrl,
      videoUrl,
      durationSec,
      displayName: node.data.displayName ?? null,
    };
  }
  if (isAudioNode(node)) {
    return {
      nodeId: node.id,
      kind: "audio",
      displayName: node.data.displayName ?? null,
    };
  }
  if (isImageGenNode(node)) {
    const data = node.data;
    const referenceImageUrl =
      typeof data.referenceImageUrl === "string" &&
      data.referenceImageUrl.length > 0
        ? data.referenceImageUrl
        : null;
    return {
      nodeId: node.id,
      kind: "image",
      thumbUrl: data.previewImageUrl || data.imageUrl || referenceImageUrl,
      displayName: data.displayName ?? null,
    };
  }
  if (isUploadNode(node) || isImageEditNode(node) || isExportImageNode(node)) {
    const data = node.data;
    return {
      nodeId: node.id,
      kind: "image",
      thumbUrl: data.previewImageUrl || data.imageUrl || null,
      displayName: data.displayName ?? null,
    };
  }
  return null;
}

export function buildCanvasStoryScriptCommand(
  params: BuildCanvasStoryScriptCommandParams,
): CanvasStoryScriptCommand | null {
  const upstreamText = params.references
    .filter((reference) => reference.kind === "text")
    .map((reference) => (reference.text ?? "").trim())
    .filter((text) => text.length > 0)
    .join("\n\n");
  const trimmedPrompt = params.prompt.trim();
  const sourceText = upstreamText.length > 0 ? upstreamText : trimmedPrompt;
  if (!sourceText) return null;

  const videoReference = params.references.find(
    (reference) => reference.kind === "video" && reference.videoUrl,
  );
  const characterRefs = params.references
    .filter((reference) => reference.kind === "image" && reference.thumbUrl)
    .map((reference) => ({
      imageUrl: reference.thumbUrl as string,
      ...(reference.displayName?.trim()
        ? { name: reference.displayName.trim() }
        : {}),
    }));
  return {
    sourceText,
    ...(videoReference?.videoUrl
      ? { videoUrl: videoReference.videoUrl }
      : {}),
    ...(videoReference?.durationSec != null
      ? { durationSec: videoReference.durationSec }
      : {}),
    ...(characterRefs.length > 0 ? { characterRefs } : {}),
    ...(upstreamText.length > 0 && trimmedPrompt
      ? { prompt: trimmedPrompt }
      : {}),
    canvasId: params.canvasId,
    nodeId: params.nodeId,
  };
}

export function isCanvasStoryScriptResult(
  value: unknown,
): value is CanvasStoryScriptResult {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as { rows?: unknown }).rows),
  );
}

export interface CanvasStoryScriptSubmissionGateway {
  submit(
    projectId: string,
    command: CanvasStoryScriptCommand,
  ): Promise<CanvasGenerationTaskRef>;
}

export interface GenerateCanvasStoryScriptParams {
  readonly projectId: string;
  readonly command: CanvasStoryScriptCommand;
}

export interface GenerateCanvasStoryScriptDependencies {
  readonly submissionGateway: CanvasStoryScriptSubmissionGateway;
  readonly taskGateway: Pick<
    CanvasGenerationTaskGateway,
    "awaitCompletion" | "fetchStoryScriptResult"
  >;
  readonly onTaskSubmitted: (task: CanvasGenerationTaskRef) => void;
}

export interface GenerateCanvasStoryScriptResult {
  readonly task: CanvasGenerationTaskRef;
  readonly scriptResult: CanvasStoryScriptResult;
}

export async function generateCanvasStoryScript(
  params: GenerateCanvasStoryScriptParams,
  dependencies: GenerateCanvasStoryScriptDependencies,
): Promise<GenerateCanvasStoryScriptResult> {
  const task = await dependencies.submissionGateway.submit(
    params.projectId,
    params.command,
  );
  dependencies.onTaskSubmitted(task);
  await dependencies.taskGateway.awaitCompletion(
    task.task_key,
    params.projectId,
  );
  const scriptResult = await dependencies.taskGateway.fetchStoryScriptResult(
    params.projectId,
    task.job_id,
  );
  return { task, scriptResult };
}
