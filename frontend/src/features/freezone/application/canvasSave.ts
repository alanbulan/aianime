// Copyright (c) 2026 AI anime
import type {
  CanvasEdge,
  CanvasNode,
} from "@/features/canvas/domain/canvasNodes";
import type { CanvasMutationSource } from "@/features/canvas/domain/canvasMutation";
import type { ViewportBookmark } from "@/features/canvas/domain/viewportBookmarks";
import type {
  CanvasBackupStatus,
  FreezoneCanvasPayload,
  FreezoneCanvasSaveResult,
} from "@/features/freezone/domain/canvasStorage";

import { canvasDraftSignature } from "./canvasDraft";
import {
  buildSavePayload,
  checkPayloadLimits,
  classifySaveError,
  decideSaveAction,
  describePayloadViolation,
  MAX_BODY_BYTES,
  saveErrorStatusAndBody,
  type SaveDecision,
  type SaveResponseOutcome,
} from "./canvasSyncCore";
import type { CanvasSyncStatus } from "./canvasSyncStorage";

const LOCK_BUSY_MAX_RETRIES = 1;

export interface CanvasSaveIdentityArgs {
  nodes: unknown[];
  edges: unknown[];
  viewport?: ViewportBookmark;
  metadata?: Record<string, unknown> | null;
  pendingClientSaveIdRef: { current: string | null };
  pendingClientSaveIdSignatureRef: { current: string | null };
}

export interface CanvasSaveArgs extends CanvasSaveIdentityArgs {
  project: string;
  canvasId: string;
  forcedDecision?: Extract<SaveDecision, { kind: "send" }>;
  revisionRef: { current: number | null };
  canvasEnvelopeRef: { current: Partial<FreezoneCanvasPayload> };
  hydratedRef: { current: boolean };
  switchingRef: { current: boolean };
  lastRemoteNodeCountRef: { current: number };
  setStatus(status: CanvasSyncStatus): void;
  setError(error: string | null): void;
  inFlightRef: { current: Promise<boolean> | null };
  snapshotConflict?(args: CanvasSaveArgs): void;
  publishBackupStatus?(status: CanvasBackupStatus | null): void;
  publishRevision?(revision: number | null): void;
  clearDraftAfterSave?(): void;
  markDraftPersisted?(signature: string): void;
}

export interface CanvasSaveRuntimeState {
  nodeCount: number;
  edgeCount: number;
  userEditsSinceHydrate: number;
  lastMutationSource: CanvasMutationSource | null;
  pendingClearIntent: boolean;
}

export interface CanvasSaveDependencies {
  readCanvasState(): CanvasSaveRuntimeState;
  generateClientSaveId(): string;
  saveCanvas(
    project: string,
    canvasId: string,
    payload: FreezoneCanvasPayload,
  ): Promise<FreezoneCanvasSaveResult>;
  clearDraft(project: string, canvasId: string): void;
  acknowledgePendingClear(): void;
  sleep(delayMs: number): Promise<void>;
  warn(message: string): void;
}

export function resolveCanvasClientSaveId(
  args: CanvasSaveIdentityArgs,
  generateClientSaveId: () => string,
): string {
  const contentSignature = JSON.stringify({
    nodes: args.nodes,
    edges: args.edges,
    viewport: args.viewport ?? null,
    metadata: args.metadata ?? null,
  });
  if (
    args.pendingClientSaveIdRef.current != null &&
    args.pendingClientSaveIdSignatureRef.current === contentSignature
  ) {
    return args.pendingClientSaveIdRef.current;
  }
  const clientSaveId = generateClientSaveId();
  args.pendingClientSaveIdRef.current = clientSaveId;
  args.pendingClientSaveIdSignatureRef.current = contentSignature;
  return clientSaveId;
}

export function createCanvasSaveScheduler(
  dependencies: CanvasSaveDependencies,
): (args: CanvasSaveArgs) => Promise<boolean> {
  const clearDraft = (args: CanvasSaveArgs): void => {
    if (args.clearDraftAfterSave) {
      args.clearDraftAfterSave();
      return;
    }
    dependencies.clearDraft(args.project, args.canvasId);
  };

  const consumeSaveResponse = (
    args: CanvasSaveArgs,
    response: FreezoneCanvasSaveResult,
    decision: Extract<SaveDecision, { kind: "send" }>,
  ): void => {
    if (typeof response.revision === "number") {
      args.revisionRef.current = response.revision;
      args.publishRevision?.(response.revision);
      args.canvasEnvelopeRef.current = {
        ...args.canvasEnvelopeRef.current,
        revision: response.revision,
        ...(response.updated_at ? { updated_at: response.updated_at } : {}),
      };
    }
    args.lastRemoteNodeCountRef.current = args.nodes.length;
    args.markDraftPersisted?.(
      canvasDraftSignature(
        args.nodes as CanvasNode[],
        args.edges as CanvasEdge[],
        args.metadata ?? null,
      ),
    );
    args.pendingClientSaveIdRef.current = null;
    args.pendingClientSaveIdSignatureRef.current = null;
    clearDraft(args);
    if (decision.saveSource === "manual_clear") {
      dependencies.acknowledgePendingClear();
    }
    const backupStatus = response.backup_status;
    args.publishBackupStatus?.(backupStatus ?? null);
    if (backupStatus === "failed") {
      args.setError("云端备份失败，请稍后再试");
    }
  };

  const performSave = async (
    args: CanvasSaveArgs,
    decision: Extract<SaveDecision, { kind: "send" }>,
    clientSaveId: string,
    attempt: number,
  ): Promise<boolean> => {
    const payload = buildSavePayload({
      canvasId: args.canvasId,
      nodes: args.nodes,
      edges: args.edges,
      viewport: args.viewport,
      metadata: args.metadata,
      baseRevision: args.revisionRef.current,
      clientSaveId,
      decision,
      envelope: args.canvasEnvelopeRef.current,
    });

    const countViolation = checkPayloadLimits(
      args.nodes.length,
      args.edges.length,
      null,
    );
    if (countViolation) {
      args.pendingClientSaveIdRef.current = null;
      args.pendingClientSaveIdSignatureRef.current = null;
      args.setError(describePayloadViolation(countViolation));
      args.setStatus("error");
      return false;
    }
    const bodySize = JSON.stringify(payload).length;
    if (bodySize > MAX_BODY_BYTES) {
      dependencies.warn(
        `[freezone] canvas PUT body ~${Math.round(bodySize / 1024)} KB ` +
          `exceeds ${Math.round(MAX_BODY_BYTES / 1024)} KB advisory cap ` +
          `(canvas_id=${args.canvasId}); proceeding anyway, backend may reject with 413`,
      );
    }

    try {
      const response = await dependencies.saveCanvas(
        args.project,
        args.canvasId,
        payload,
      );
      consumeSaveResponse(args, response, decision);
      args.setStatus("ready");
      args.setError(null);
      return true;
    } catch (error) {
      return handleSaveError(args, error, decision, clientSaveId, attempt);
    }
  };

  const handleSaveError = async (
    args: CanvasSaveArgs,
    error: unknown,
    decision: Extract<SaveDecision, { kind: "send" }>,
    clientSaveId: string,
    attempt: number,
  ): Promise<boolean> => {
    const { status, body } = saveErrorStatusAndBody(error);
    const fallback = error instanceof Error ? error.message : String(error);
    const outcome: SaveResponseOutcome = classifySaveError(
      status,
      body,
      fallback,
    );
    const dropPendingId = () => {
      args.pendingClientSaveIdRef.current = null;
      args.pendingClientSaveIdSignatureRef.current = null;
    };

    switch (outcome.kind) {
      case "conflict":
        dropPendingId();
        args.snapshotConflict?.(args);
        args.setError(outcome.message);
        args.setStatus("conflict");
        return false;
      case "dangerous_empty":
        dropPendingId();
        args.setError(outcome.message);
        args.setStatus("conflict");
        return false;
      case "retry":
        if (attempt < LOCK_BUSY_MAX_RETRIES) {
          await dependencies.sleep(outcome.afterMs);
          return performSave(args, decision, clientSaveId, attempt + 1);
        }
        dropPendingId();
        args.setError("画布写入被锁占用，请稍后重试");
        args.setStatus("error");
        return false;
      case "ok_with_warning":
        dropPendingId();
        clearDraft(args);
        args.publishBackupStatus?.(outcome.backupStatus);
        args.setError(null);
        args.setStatus("ready");
        return true;
      case "fatal":
        dropPendingId();
        args.setError(outcome.message);
        args.setStatus("error");
        return false;
      case "error":
      default:
        dropPendingId();
        args.setError(outcome.message);
        args.setStatus("error");
        return false;
    }
  };

  return async (args: CanvasSaveArgs): Promise<boolean> => {
    if (args.inFlightRef.current) {
      await args.inFlightRef.current;
    }

    const canvasState = dependencies.readCanvasState();
    const decision: SaveDecision =
      args.forcedDecision ??
      decideSaveAction({
        hydrated: args.hydratedRef.current,
        switching: args.switchingRef.current,
        nodeCount: canvasState.nodeCount,
        edgeCount: canvasState.edgeCount,
        lastRemoteNodeCount: args.lastRemoteNodeCountRef.current,
        userEditsSinceHydrate: canvasState.userEditsSinceHydrate,
        lastMutationSource: canvasState.lastMutationSource,
        pendingClearIntent: canvasState.pendingClearIntent,
      });

    if (decision.kind === "skip") return false;
    if (decision.kind === "block") {
      args.pendingClientSaveIdRef.current = null;
      args.pendingClientSaveIdSignatureRef.current = null;
      args.setError(
        "本地画布为空但服务器还有节点，已暂停自动保存以避免覆盖。请刷新后再编辑。",
      );
      args.setStatus("conflict");
      return false;
    }

    const clientSaveId = resolveCanvasClientSaveId(
      args,
      dependencies.generateClientSaveId,
    );

    args.setStatus("saving");
    const job = (async () => {
      try {
        return await performSave(args, decision, clientSaveId, 0);
      } finally {
        args.inFlightRef.current = null;
      }
    })();
    args.inFlightRef.current = job;
    return job;
  };
}
