// Copyright (c) 2026 AI anime
// Persisting + resuming task_key-based generations across page reloads.
//
// Most canvas generations (image / video / audio / 3D / script / 反推提示词) submit
// a freezone job, get a `FreezoneJobRef`, then `await awaitTaskCompletion(task_key)`.
// That promise lives only in memory, so a page refresh used to drop the progress
// bar and stop polling entirely. We fix this by persisting the task identity on the
// node (so the 生成中 overlay re-appears from `generationStartedAt`) and re-attaching
// to the task API on reload via {@link resumeNodeGeneration}.

import { providerErrorMessage } from "@/shared/api/errors";

import {
  parseCanvasGenerationTaskRef,
  recoverCanvasMediaGenerationTask,
  requireCanvasGenerationTaskRef,
  type CanvasGenerationTaskCompletion,
  type CanvasGenerationTaskRef,
  type CanvasStructuredTaskResultGateway,
  type CanvasTaskResultGateway,
} from "./completeCanvasMediaGenerationTask";
import { resolveErrorContent } from "./errorDialog";
import {
  isCanvasStoryScriptResult,
  type CanvasStoryScriptResult,
} from "./generateCanvasStoryScript";
import { resolveCanvasReversePrompt } from "./generateCanvasReversePrompt";
import { extractRequestId } from "./generationErrorReport";
import { shouldWriteGenerationError } from "./generationTaskArbitration";
import { resolveGenerationOutputUrl } from "./generationOutputUrl";
import { pickCanvasImageTo3dResultUrl } from "../domain/imageTo3d";

type FreezoneTaskType = CanvasGenerationTaskRef["task_type"];

export interface CanvasGenerationTaskGateway
  extends CanvasTaskResultGateway,
    CanvasStructuredTaskResultGateway {
  hasTask(projectId: string, taskKey: string): Promise<boolean>;
  fetchReversePrompt(projectId: string, jobId: string): Promise<string>;
  fetchStoryScriptResult(
    projectId: string,
    jobId: string,
  ): Promise<CanvasStoryScriptResult>;
}

export interface CanvasGenerationRecoveryNode {
  readonly id: string;
  readonly type?: string;
  readonly data: unknown;
}

/**
 * The persisted handle that lets a refreshed page re-attach to a running job.
 * `generationTaskJobId` is the canonical task receipt field. Legacy export-image
 * nodes also mirror the same value into `generationJobId` while their result
 * postprocessor is active.
 */
export interface GenerationTaskDescriptor {
  generationTaskKey: string;
  generationTaskType: FreezoneTaskType;
  generationTaskJobId: string;
  generationTaskRefs: readonly CanvasGenerationTaskRef[] | null;
  // Index signature so the descriptor spreads cleanly into updateNodeData's
  // Partial<CanvasNodeData> union (some node-data members carry index signatures).
  [key: string]: unknown;
}

export function readGenerationTaskDescriptor(
  value: unknown,
): CanvasGenerationTaskRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const data = value as Record<string, unknown>;
  return parseCanvasGenerationTaskRef({
    task_key: data.generationTaskKey,
    task_type: data.generationTaskType,
    job_id: data.generationTaskJobId,
  });
}

export function readGenerationTaskDescriptors(
  value: unknown,
): CanvasGenerationTaskRef[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const data = value as Record<string, unknown>;
  if (Array.isArray(data.generationTaskRefs)) {
    if (data.generationTaskRefs.length === 0) return null;
    const tasks = data.generationTaskRefs.map(parseCanvasGenerationTaskRef);
    if (tasks.some((task) => task === null)) return null;
    const uniqueTasks = new Map<string, CanvasGenerationTaskRef>();
    for (const task of tasks as CanvasGenerationTaskRef[]) {
      uniqueTasks.set(task.task_key, task);
    }
    return [...uniqueTasks.values()];
  }
  const task = readGenerationTaskDescriptor(data);
  return task ? [task] : null;
}

// Task keys whose completion is already handled by an in-session submit flow.
// The resume scanner skips these while they are running so the originating flow
// remains the single writer. This set is empty after a page reload, allowing
// persisted-but-orphaned tasks to resume.
const sessionOwnedTaskKeys = new Set<string>();

/**
 * Build the patch that records a freezone job on a node right after submit so the
 * generation can be resumed after a refresh. Spread alongside the
 * `{ isGenerating: true, generationStartedAt }` patch each flow already writes.
 *
 * Also marks the task key as session-owned so {@link nodeNeedsGenerationResume}
 * won't double-attach while the originating flow is still awaiting it.
 */
export function generationTaskDescriptor(
  ref: CanvasGenerationTaskRef,
): GenerationTaskDescriptor {
  const task = requireCanvasGenerationTaskRef(ref);
  sessionOwnedTaskKeys.add(task.task_key);
  return {
    generationTaskKey: task.task_key,
    generationTaskType: task.task_type,
    generationTaskJobId: task.job_id,
    generationTaskRefs: null,
  };
}

export function generationTaskBatchDescriptor(
  refs: readonly CanvasGenerationTaskRef[],
): GenerationTaskDescriptor {
  if (refs.length === 0) {
    throw new Error("批量生成任务回执不能为空");
  }
  const tasks = refs.map((ref) => requireCanvasGenerationTaskRef(ref));
  const primaryTask = tasks[0];
  if (tasks.some((task) => task.task_type !== primaryTask.task_type)) {
    throw new Error("同一批生成任务的 task_type 必须一致");
  }
  for (const task of tasks) {
    sessionOwnedTaskKeys.add(task.task_key);
  }
  return {
    generationTaskKey: primaryTask.task_key,
    generationTaskType: primaryTask.task_type,
    generationTaskJobId: primaryTask.job_id,
    generationTaskRefs: tasks,
  };
}

export interface ClearedGenerationTaskDescriptor {
  generationTaskKey: null;
  generationTaskType: null;
  generationTaskJobId: null;
  generationTaskRefs: null;
  [key: string]: unknown;
}

const CLEARED_GENERATION_TASK_DESCRIPTOR = {
  generationTaskKey: null,
  generationTaskType: null,
  generationTaskJobId: null,
  generationTaskRefs: null,
} as const;

/**
 * Finish the in-session ownership of a submitted task and clear its persisted
 * handle from the node in the same update. Every originating submit flow must
 * use this on both success and failure.
 */
export function clearGenerationTaskDescriptor(
  taskKey?: string | readonly string[] | null,
): ClearedGenerationTaskDescriptor {
  const taskKeys = Array.isArray(taskKey) ? taskKey : [taskKey];
  for (const key of taskKeys) {
    if (key) sessionOwnedTaskKeys.delete(key);
  }
  return { ...CLEARED_GENERATION_TASK_DESCRIPTOR };
}

type ResumeKind =
  | "image"
  | "video"
  | "audio"
  | "ply"
  | "script"
  | "reverse-prompt";

function resumeKindForNodeType(type: string | undefined): ResumeKind | null {
  switch (type) {
    case "imageGenNode":
    case "imageNode":
    case "exportImageNode":
      return "image";
    case "videoNode":
      return "video";
    case "audioNode":
      return "audio";
    case "threeDWorldNode":
      return "ply";
    case "scriptNode":
      return "script";
    case "textAnnotationNode":
      return "reverse-prompt";
    default:
      return null;
  }
}

/** Fields cleared on every settle so the node leaves the 生成中 state cleanly. */
const CLEARED_TASK_FIELDS = {
  isGenerating: false,
  generationStartedAt: null,
  ...CLEARED_GENERATION_TASK_DESCRIPTOR,
} as const;

function isCurrentGenerationTask(
  nodeData: Record<string, unknown> | null | undefined,
  taskKey: string,
): nodeData is Record<string, unknown> {
  return (
    nodeData?.isGenerating === true
    && nodeData.generationTaskKey === taskKey
  );
}

async function resumeMediaTaskBatch(
  tasks: readonly CanvasGenerationTaskRef[],
  kind: "image" | "video",
  projectId: string,
  gateway: CanvasGenerationTaskGateway,
): Promise<Record<string, unknown>> {
  const media = kind;
  const settled = await Promise.allSettled(
    tasks.map((task) =>
      recoverCanvasMediaGenerationTask(
        { projectId, task, media },
        gateway,
      ),
    ),
  );
  const urls = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  if (urls.length === 0) {
    const failure = settled.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    throw failure?.reason ?? new Error("批量生成任务未返回结果");
  }
  const url = urls[0];
  return kind === "image"
    ? {
        ...CLEARED_TASK_FIELDS,
        imageUrl: url,
        previewImageUrl: url,
        generationBatch: urls.length > 1 ? urls : null,
        generationError: null,
        generationErrorDetails: null,
        generationErrorRequestId: null,
      }
    : {
        ...CLEARED_TASK_FIELDS,
        videoUrl: url,
        sourceFileName: null,
        generationBatch: urls.length > 1 ? urls : null,
        generationError: null,
        generationErrorDetails: null,
        generationErrorRequestId: null,
      };
}

async function buildSuccessPatch(
  kind: ResumeKind,
  completed: CanvasGenerationTaskCompletion,
  taskType: FreezoneTaskType,
  jobId: string,
  projectId: string,
  gateway: CanvasGenerationTaskGateway,
): Promise<Record<string, unknown>> {
  switch (kind) {
    case "image": {
      let url = resolveGenerationOutputUrl(completed.result, "image");
      if (!url && jobId) {
        url = await gateway
          .fetchResultUrl(projectId, taskType, jobId)
          .catch(() => null);
      }
      if (!url) {
        return { ...CLEARED_TASK_FIELDS, generationError: "生成未返回结果" };
      }
      return {
        ...CLEARED_TASK_FIELDS,
        imageUrl: url,
        previewImageUrl: url,
        generationError: null,
      };
    }
    case "video": {
      let url = resolveGenerationOutputUrl(completed.result, "video");
      if (!url && jobId) {
        url = await gateway
          .fetchResultUrl(projectId, taskType, jobId)
          .catch(() => null);
      }
      if (!url) {
        return { ...CLEARED_TASK_FIELDS, generationError: "视频生成未返回结果" };
      }
      return {
        ...CLEARED_TASK_FIELDS,
        videoUrl: url,
        sourceFileName: null,
        generationError: null,
        generationErrorDetails: null,
        generationErrorRequestId: null,
      };
    }
    case "audio": {
      let url = resolveGenerationOutputUrl(completed.result, "audio");
      if (!url && jobId) {
        url = await gateway
          .fetchResultUrl(projectId, taskType, jobId)
          .catch(() => null);
      }
      if (!url) {
        return {
          ...CLEARED_TASK_FIELDS,
          generationError: "音频生成未返回结果",
        };
      }
      return {
        ...CLEARED_TASK_FIELDS,
        audioUrl: url,
        durationMs: null,
        generationError: null,
      };
    }
    case "ply": {
      let plyUrl = pickCanvasImageTo3dResultUrl(completed.result);
      if (!plyUrl && jobId) {
        const fallbackUrl = await gateway
          .fetchResultUrl(projectId, taskType, jobId)
          .catch(() => null);
        if (fallbackUrl) {
          plyUrl = pickCanvasImageTo3dResultUrl({ output_url: fallbackUrl });
        }
      }
      if (!plyUrl) {
        return {
          ...CLEARED_TASK_FIELDS,
          taskKey: null,
          errorMessage: "生成失败: 未能在 task.result 中找到 3D 世界地址",
        };
      }
      return {
        ...CLEARED_TASK_FIELDS,
        plyUrl,
        taskKey: null,
        errorMessage: null,
      };
    }
    case "script": {
      const candidate = isCanvasStoryScriptResult(completed.result)
        ? completed.result
        : await gateway.fetchStoryScriptResult(projectId, jobId);
      if (!isCanvasStoryScriptResult(candidate)) {
        throw new Error("剧本生成任务返回的数据结构无效");
      }
      const result = candidate;
      return {
        ...CLEARED_TASK_FIELDS,
        scriptResult: result,
        scriptTitle: result.title ?? null,
        generationError: null,
      };
    }
    case "reverse-prompt": {
      const prompt =
        resolveCanvasReversePrompt(completed.result)
        ?? await gateway.fetchReversePrompt(projectId, jobId);
      if (prompt && prompt.trim().length > 0) {
        return {
          ...CLEARED_TASK_FIELDS,
          content: prompt,
          generationError: null,
        };
      }
      return {
        ...CLEARED_TASK_FIELDS,
        generationError: "反推提示词任务未返回结果",
      };
    }
    default:
      return { ...CLEARED_TASK_FIELDS };
  }
}

function buildErrorPatch(
  kind: ResumeKind,
  error: unknown,
): Record<string, unknown> {
  if (kind === "ply") {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...CLEARED_TASK_FIELDS,
      taskKey: null,
      errorMessage: `生成失败: ${message}`,
    };
  }
  if (kind === "image" || kind === "video") {
    const resolved = resolveErrorContent(
      error,
      kind === "video" ? "视频生成失败" : "图像生成失败",
    );
    const rawMessage = resolved.message;
    return {
      ...CLEARED_TASK_FIELDS,
      generationError: providerErrorMessage(rawMessage) ?? rawMessage,
      generationErrorDetails: resolved.details ?? rawMessage,
      generationErrorRequestId:
        extractRequestId(rawMessage) ?? extractRequestId(resolved.details),
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    ...CLEARED_TASK_FIELDS,
    generationError: message || "生成失败",
  };
}

function hasRecoveredOutput(
  kind: ResumeKind,
  patch: Record<string, unknown>,
): boolean {
  switch (kind) {
    case "image":
      return typeof patch.imageUrl === "string" && patch.imageUrl.length > 0;
    case "video":
      return typeof patch.videoUrl === "string" && patch.videoUrl.length > 0;
    case "audio":
      return typeof patch.audioUrl === "string" && patch.audioUrl.length > 0;
    case "ply":
      return typeof patch.plyUrl === "string" && patch.plyUrl.length > 0;
    case "script":
      return isCanvasStoryScriptResult(patch.scriptResult);
    case "reverse-prompt":
      return typeof patch.content === "string" && patch.content.trim().length > 0;
  }
}

/**
 * Re-attach to a running freezone task for a node that came back from storage
 * still flagged `isGenerating`. Resolves the result and writes it onto the node,
 * or records the failure — mirroring each flow's own success/error handling.
 *
 * Returns once the task settles (or is found to no longer exist). Safe to call
 * once per node; callers should dedupe.
 */
export interface ResumeNodeGenerationParams {
  node: CanvasGenerationRecoveryNode;
  projectId: string;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  getNodeData?: (id: string) => Record<string, unknown> | null | undefined;
}

export async function resumeNodeGeneration(
  params: ResumeNodeGenerationParams,
  gateway: CanvasGenerationTaskGateway,
): Promise<void> {
  const { node, projectId, updateNodeData, getNodeData } = params;
  const data = node.data as Record<string, unknown>;
  const taskKey = typeof data.generationTaskKey === "string"
    ? data.generationTaskKey.trim()
    : "";
  const tasks = readGenerationTaskDescriptors(data);
  const task = tasks?.[0] ?? null;
  const taskType = task?.task_type ?? null;
  const jobId = task?.job_id ?? "";
  const kind = resumeKindForNodeType(node.type);

  if (!taskKey || !kind) {
    return;
  }

  if (!task || !taskType || !tasks || task.task_key !== taskKey) {
    if (isCurrentGenerationTask(data, taskKey)) {
      updateNodeData(
        node.id,
        buildErrorPatch(kind, new Error("生成任务信息不完整")),
      );
    }
    return;
  }

  // Recovery now owns result reconciliation for this task. Removing the
  // session marker here keeps store selectors pure and permits a later retry if
  // this recovery attempt is interrupted before it updates the node.
  for (const item of tasks) {
    sessionOwnedTaskKeys.delete(item.task_key);
  }

  const readLatestNodeData = () =>
    getNodeData
      ? getNodeData(node.id)
      : (node.data as Record<string, unknown>);

  if (tasks.length > 1 && (kind === "image" || kind === "video")) {
    try {
      const successPatch = await resumeMediaTaskBatch(
        tasks,
        kind,
        projectId,
        gateway,
      );
      if (isCurrentGenerationTask(readLatestNodeData(), taskKey)) {
        updateNodeData(node.id, successPatch);
      }
    } catch (error) {
      const latestNodeData = readLatestNodeData();
      if (!isCurrentGenerationTask(latestNodeData, taskKey)) return;
      if (!shouldWriteGenerationError({ nodeData: latestNodeData, taskKey, error })) {
        updateNodeData(node.id, { ...CLEARED_TASK_FIELDS });
        return;
      }
      updateNodeData(node.id, buildErrorPatch(kind, error));
    }
    return;
  }

  // Quick pre-check: if the task no longer exists server-side (expired/cleaned),
  // avoid hanging on the 20-minute poll timeout — clear the stuck 生成中 state now.
  try {
    const taskExists = await gateway.hasTask(projectId, taskKey);
    if (!taskExists) {
      const latestNodeData = readLatestNodeData();
      if (!isCurrentGenerationTask(latestNodeData, taskKey)) {
        return;
      }

      try {
        const recoveredPatch = await buildSuccessPatch(
          kind,
          { result: null },
          taskType,
          jobId,
          projectId,
          gateway,
        );
        if (!isCurrentGenerationTask(readLatestNodeData(), taskKey)) {
          return;
        }
        updateNodeData(
          node.id,
          hasRecoveredOutput(kind, recoveredPatch)
            ? recoveredPatch
            : buildErrorPatch(kind, new Error("生成任务已结束或不存在")),
        );
      } catch {
        if (!isCurrentGenerationTask(readLatestNodeData(), taskKey)) {
          return;
        }
        updateNodeData(
          node.id,
          buildErrorPatch(kind, new Error("生成任务已结束或不存在")),
        );
      }
      return;
    }
  } catch {
    // List failed (transient/offline) — fall through to awaitTaskCompletion,
    // which has its own poll + timeout handling.
  }

  try {
    const completed = await gateway.awaitCompletion(taskKey, projectId);
    if (!isCurrentGenerationTask(readLatestNodeData(), taskKey)) {
      return;
    }
    const successPatch = await buildSuccessPatch(
      kind,
      completed,
      taskType,
      jobId,
      projectId,
      gateway,
    );
    if (!isCurrentGenerationTask(readLatestNodeData(), taskKey)) {
      return;
    }
    updateNodeData(node.id, successPatch);
  } catch (error) {
    console.warn("[resume-generation] task resume failed", {
      nodeId: node.id,
      taskKey,
      error,
    });
    const latestNodeData = readLatestNodeData();
    if (!isCurrentGenerationTask(latestNodeData, taskKey)) {
      return;
    }
    if (kind === "image" || kind === "video") {
      if (
        !shouldWriteGenerationError({
          nodeData: latestNodeData,
          taskKey,
          error,
        })
      ) {
        updateNodeData(node.id, { ...CLEARED_TASK_FIELDS });
        return;
      }
    }

    updateNodeData(node.id, buildErrorPatch(kind, error));
  }
}

/**
 * Whether a node restored from storage needs {@link resumeNodeGeneration}. Returns
 * false for tasks already being handled by an in-session flow. After a reload
 * the in-memory ownership set is empty, so persisted jobs are picked up here.
 */
export function nodeNeedsGenerationResume(
  node: CanvasGenerationRecoveryNode,
): boolean {
  const data = node.data as Record<string, unknown>;
  const taskKey =
    typeof data.generationTaskKey === "string" ? data.generationTaskKey : "";
  const tasks = readGenerationTaskDescriptors(data);
  const isLegacyExportImageFlow =
    node.type === "exportImageNode"
    && typeof data.generationJobId === "string"
    && data.generationJobId.trim().length > 0;
  const hasSessionOwner = tasks
    ? tasks.some((task) => sessionOwnedTaskKeys.has(task.task_key))
    : sessionOwnedTaskKeys.has(taskKey);
  return (
    data.isGenerating === true
    && taskKey.length > 0
    && resumeKindForNodeType(node.type) !== null
    && !isLegacyExportImageFlow
    && !hasSessionOwner
  );
}
