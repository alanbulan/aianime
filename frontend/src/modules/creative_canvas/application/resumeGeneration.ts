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

import type {
  CanvasGenerationTaskCompletion,
  CanvasGenerationTaskRef,
  CanvasTaskResultGateway,
} from "./completeCanvasMediaGenerationTask";
import { resolveErrorContent } from "./errorDialog";
import type { CanvasStoryScriptResult } from "./generateCanvasStoryScript";
import { extractRequestId } from "./generationErrorReport";
import { shouldWriteGenerationError } from "./generationTaskArbitration";
import { resolveGenerationOutputUrl } from "./generationOutputUrl";

type FreezoneTaskType = CanvasGenerationTaskRef["task_type"];

export interface CanvasGenerationTaskGateway extends CanvasTaskResultGateway {
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
 * `generationTaskJobId` is intentionally separate from `generationJobId` — the
 * latter belongs to the canvasAiGateway image-job poller in Canvas.tsx and must
 * not be confused with a freezone task job id.
 */
export interface GenerationTaskDescriptor {
  generationTaskKey: string;
  generationTaskType: FreezoneTaskType;
  generationTaskJobId: string;
  // Index signature so the descriptor spreads cleanly into updateNodeData's
  // Partial<CanvasNodeData> union (some node-data members carry index signatures).
  [key: string]: unknown;
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
  sessionOwnedTaskKeys.add(ref.task_key);
  return {
    generationTaskKey: ref.task_key,
    generationTaskType: ref.task_type,
    generationTaskJobId: ref.job_id,
  };
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

// Mirror ThreeDWorldNode's pickPlyUrlFromResult so 3D scenes resume the same way.
function pickPlyUrlFromResult(
  result: CanvasGenerationTaskCompletion["result"],
): string | null {
  if (!result) return null;
  const candidates: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 4) return;
    if (typeof value === "string") {
      if (
        /\.(ply|sog|splat|ksplat|spz)(\?|#|$)/i.test(value)
        || /scene_3gs|ply_fs|splat/i.test(value)
      ) {
        candidates.push(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (value && typeof value === "object") {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        visit(nested, depth + 1);
      }
    }
  };
  visit(result, 0);
  const sog = candidates.find((c) => /\.sog(\?|#|$)/i.test(c));
  if (sog) return sog;
  const packaged = candidates.find((candidate) =>
    /\.(ksplat|splat|spz)(\?|#|$)/i.test(candidate),
  );
  if (packaged) return packaged;
  const ply = candidates.find((c) => /\.ply(\?|#|$)/i.test(c));
  if (ply) return ply;
  return candidates[0] ?? null;
}

/** Fields cleared on every settle so the node leaves the 生成中 state cleanly. */
const CLEARED_TASK_FIELDS = {
  isGenerating: false,
  generationStartedAt: null,
  generationTaskKey: null,
  generationTaskType: null,
  generationTaskJobId: null,
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
        return { ...CLEARED_TASK_FIELDS };
      }
      return { ...CLEARED_TASK_FIELDS, audioUrl: url, durationMs: null };
    }
    case "ply": {
      const plyUrl = pickPlyUrlFromResult(completed.result);
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
      const result = await gateway.fetchStoryScriptResult(projectId, jobId);
      return {
        ...CLEARED_TASK_FIELDS,
        scriptResult: result,
        scriptTitle: result.title ?? null,
      };
    }
    case "reverse-prompt": {
      const prompt = await gateway.fetchReversePrompt(projectId, jobId);
      if (prompt && prompt.trim().length > 0) {
        return { ...CLEARED_TASK_FIELDS, content: prompt };
      }
      return { ...CLEARED_TASK_FIELDS };
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
  // audio / script / reverse-prompt surface their own inline errors elsewhere;
  // just leave the 生成中 state.
  return { ...CLEARED_TASK_FIELDS };
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
  const taskKey =
    typeof data.generationTaskKey === "string" ? data.generationTaskKey : "";
  const taskType =
    typeof data.generationTaskType === "string"
      ? (data.generationTaskType as FreezoneTaskType)
      : null;
  const jobId =
    typeof data.generationTaskJobId === "string"
      ? data.generationTaskJobId
      : "";
  const kind = resumeKindForNodeType(node.type);

  if (!taskKey || !taskType || !kind) {
    return;
  }

  // Recovery now owns result reconciliation for this task. Removing the
  // session marker here keeps store selectors pure and permits a later retry if
  // this recovery attempt is interrupted before it updates the node.
  sessionOwnedTaskKeys.delete(taskKey);

  const readLatestNodeData = () =>
    getNodeData
      ? getNodeData(node.id)
      : (node.data as Record<string, unknown>);

  // Quick pre-check: if the task no longer exists server-side (expired/cleaned),
  // avoid hanging on the 20-minute poll timeout — clear the stuck 生成中 state now.
  try {
    const taskExists = await gateway.hasTask(projectId, taskKey);
    if (!taskExists) {
      const latestNodeData = readLatestNodeData();
      if (!isCurrentGenerationTask(latestNodeData, taskKey)) {
        return;
      }

      updateNodeData(
        node.id,
        buildErrorPatch(kind, new Error("生成任务已结束或不存在")),
      );
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
 * false for tasks already being handled by an in-session flow, unless the task
 * center has observed a terminal state and the node still needs reconciliation.
 */
export function nodeNeedsGenerationResume(
  node: CanvasGenerationRecoveryNode,
  taskSettled = false,
): boolean {
  const data = node.data as Record<string, unknown>;
  const taskKey =
    typeof data.generationTaskKey === "string" ? data.generationTaskKey : "";
  return (
    data.isGenerating === true
    && taskKey.length > 0
    && (taskSettled || !sessionOwnedTaskKeys.has(taskKey))
  );
}
