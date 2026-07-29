// Copyright (c) 2026 AI anime
import { useCallback } from "react";

import type {
  CanvasBackupStatus,
  FreezoneCanvasPayload,
} from "@/features/freezone/domain/canvasStorage";

import type {
  CanvasSyncStatus,
  ConflictSnapshot,
} from "../application/canvasSyncStorage";
import { canvasConflictRecovery } from "../canvasConflictRecoveryComposition";
import { shotMetadataState } from "../shotMetadataComposition";
import type { CanvasSaveController } from "./useCanvasSaveController";

interface ValueRef<T> {
  current: T;
}

export interface CanvasConflictControllerOptions {
  project: string;
  canvasId: string;
  canvasEnvelopeRef: ValueRef<Partial<FreezoneCanvasPayload>>;
  revisionRef: ValueRef<number | null>;
  saveController: Pick<CanvasSaveController, "resetIdentity">;
  reload(): void;
  setRevision(revision: number | null): void;
  setBackupStatus(status: CanvasBackupStatus | null): void;
  setStatus(status: CanvasSyncStatus): void;
  setError(error: string | null): void;
}

export interface CanvasConflictController {
  retry(): void;
  saveCopy(): Promise<string>;
  readConflictSnapshot(): ConflictSnapshot | null;
  clearConflictSnapshot(): void;
}

export function useCanvasConflictController({
  project,
  canvasId,
  canvasEnvelopeRef,
  revisionRef,
  saveController,
  reload,
  setRevision,
  setBackupStatus,
  setStatus,
  setError,
}: CanvasConflictControllerOptions): CanvasConflictController {
  const retry = useCallback(() => {
    canvasConflictRecovery.discard(project, canvasId);
    reload();
  }, [canvasId, project, reload]);

  const saveCopy = useCallback(async () => {
    const shot = shotMetadataState.getShot();
    const result = await canvasConflictRecovery.saveCopy({
      project,
      sourceCanvasId: canvasId,
      envelope: canvasEnvelopeRef.current,
      shotMetadata: shot,
    });
    revisionRef.current = result.revision;
    setRevision(result.revision);
    setBackupStatus(result.backupStatus);
    saveController.resetIdentity();
    setStatus("ready");
    setError(null);
    return result.canvasId;
  }, [
    canvasEnvelopeRef,
    canvasId,
    project,
    revisionRef,
    saveController,
    setBackupStatus,
    setError,
    setRevision,
    setStatus,
  ]);

  const readConflictSnapshot = useCallback(
    () => canvasConflictRecovery.readSnapshot(canvasId),
    [canvasId],
  );
  const clearConflictSnapshot = useCallback(
    () => canvasConflictRecovery.clearSnapshot(canvasId),
    [canvasId],
  );

  return {
    retry,
    saveCopy,
    readConflictSnapshot,
    clearConflictSnapshot,
  };
}
