// Copyright (c) 2026 AI anime
import type {
  CanvasBackupStatus,
  FreezoneCanvasPayload,
  FreezoneCanvasSaveResult,
} from "../domain/canvasStorage";
import {
  buildConflictCopyMetadata,
  type ConflictSnapshot,
} from "./canvasSyncStorage";

export interface CanvasConflictCaptureArgs {
  canvasId: string;
  nodes: unknown[];
  edges: unknown[];
  viewport?: unknown;
  metadata?: Record<string, unknown> | null;
  timestamp?: string;
}

export interface SaveCanvasConflictCopyArgs {
  project: string;
  sourceCanvasId: string;
  envelope: Partial<FreezoneCanvasPayload>;
  shotMetadata: unknown;
}

export interface CanvasConflictCopyResult {
  canvasId: string;
  revision: number;
  backupStatus: CanvasBackupStatus | null;
}

export interface CanvasConflictRecoveryDependencies {
  readConflictSnapshot(canvasId: string): ConflictSnapshot | null;
  writeConflictSnapshot(snapshot: ConflictSnapshot): void;
  clearConflictSnapshot(canvasId: string): void;
  clearDraft(project: string, canvasId: string): void;
  createCopyCanvasId(sourceCanvasId: string): string;
  generateClientSaveId(): string;
  saveCanvas(
    project: string,
    canvasId: string,
    payload: FreezoneCanvasPayload,
  ): Promise<FreezoneCanvasSaveResult>;
  nowIso(): string;
}

export interface CanvasConflictRecovery {
  capture(args: CanvasConflictCaptureArgs): void;
  readSnapshot(canvasId: string): ConflictSnapshot | null;
  clearSnapshot(canvasId: string): void;
  discard(project: string, canvasId: string): void;
  saveCopy(
    args: SaveCanvasConflictCopyArgs,
  ): Promise<CanvasConflictCopyResult>;
}

export function createCanvasConflictRecovery(
  dependencies: CanvasConflictRecoveryDependencies,
): CanvasConflictRecovery {
  return {
    capture(args) {
      dependencies.writeConflictSnapshot({
        canvas_id: args.canvasId,
        nodes: args.nodes,
        edges: args.edges,
        viewport: args.viewport ?? null,
        metadata: args.metadata ?? null,
        timestamp: args.timestamp ?? dependencies.nowIso(),
      });
    },

    readSnapshot(canvasId) {
      return dependencies.readConflictSnapshot(canvasId);
    },

    clearSnapshot(canvasId) {
      dependencies.clearConflictSnapshot(canvasId);
    },

    discard(project, canvasId) {
      dependencies.clearConflictSnapshot(canvasId);
      dependencies.clearDraft(project, canvasId);
    },

    async saveCopy(args) {
      const snapshot = dependencies.readConflictSnapshot(args.sourceCanvasId);
      if (!snapshot) {
        throw new Error("No local conflict snapshot is available to save.");
      }
      const copyCanvasId = dependencies.createCopyCanvasId(args.sourceCanvasId);
      const response = await dependencies.saveCanvas(
        args.project,
        copyCanvasId,
        {
          ...args.envelope,
          canvas_id: copyCanvasId,
          revision: undefined,
          base_revision: undefined,
          nodes: snapshot.nodes,
          edges: snapshot.edges,
          viewport: snapshot.viewport,
          metadata: buildConflictCopyMetadata({
            sourceCanvasId: args.sourceCanvasId,
            metadata: {
              ...(snapshot.metadata ?? {}),
              shotMetadata: args.shotMetadata,
            },
          }),
          client_save_id: dependencies.generateClientSaveId(),
          save_source: "manual_save",
          allow_empty_overwrite: snapshot.nodes.length === 0,
        },
      );
      dependencies.clearConflictSnapshot(args.sourceCanvasId);
      dependencies.clearDraft(args.project, args.sourceCanvasId);
      return {
        canvasId: copyCanvasId,
        revision: response.revision ?? 1,
        backupStatus: response.backup_status ?? null,
      };
    },
  };
}
