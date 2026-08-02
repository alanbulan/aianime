// Copyright (c) 2026 AI anime
import { useCallback } from "react";

import type { CanvasConflictRecovery } from "../application/canvasConflictRecovery";
import type {
  CanvasSyncStatus,
  ConflictSnapshot,
} from "../application/canvasSyncStorage";
import type {
  CanvasBackupStatus,
  FreezoneCanvasPayload,
} from "../domain/canvasStorage";
import type { ShotMetadata } from "../domain/shotMetadata";

interface ValueRef<T> {
  current: T;
}

interface CanvasConflictControllerDependencies {
  recovery: CanvasConflictRecovery;
  readShotMetadata(): ShotMetadata;
}

export interface CanvasConflictControllerOptions {
  project: string;
  canvasId: string;
  canvasEnvelopeRef: ValueRef<Partial<FreezoneCanvasPayload>>;
  revisionRef: ValueRef<number | null>;
  saveController: { resetIdentity(): void };
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

export function createUseCanvasConflictController(
  dependencies: CanvasConflictControllerDependencies,
) {
  return function useCanvasConflictController({
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
      dependencies.recovery.discard(project, canvasId);
      reload();
    }, [canvasId, project, reload]);

    const saveCopy = useCallback(async () => {
      const result = await dependencies.recovery.saveCopy({
        project,
        sourceCanvasId: canvasId,
        envelope: canvasEnvelopeRef.current,
        shotMetadata: dependencies.readShotMetadata(),
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
      () => dependencies.recovery.readSnapshot(canvasId),
      [canvasId],
    );
    const clearConflictSnapshot = useCallback(
      () => dependencies.recovery.clearSnapshot(canvasId),
      [canvasId],
    );

    return {
      retry,
      saveCopy,
      readConflictSnapshot,
      clearConflictSnapshot,
    };
  };
}
