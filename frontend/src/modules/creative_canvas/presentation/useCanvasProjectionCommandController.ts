// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef } from "react";

import type { CanvasProjectionCommands } from "../application/canvasProjection";
import type { CanvasProjectionCommandEventSource } from "../application/canvasProjectionCommandEvents";

export interface CanvasProjectionCommandMessages {
  syncMissingRequest: string;
  syncSuccess: string;
  removeBlocked: string;
  removeSuccess: string;
}

export interface CanvasProjectionCommandControllerOptions {
  projectId: string;
  canvasId: string;
  metadata: Record<string, unknown> | null;
  messages: CanvasProjectionCommandMessages;
  onMessage: (message: string) => void;
}

export interface CanvasProjectionCommandControllerDependencies {
  events: CanvasProjectionCommandEventSource;
  commands: CanvasProjectionCommands;
}

export function createUseCanvasProjectionCommandController({
  events,
  commands,
}: CanvasProjectionCommandControllerDependencies) {
  return function useCanvasProjectionCommandController({
    projectId,
    canvasId,
    metadata,
    messages,
    onMessage,
  }: CanvasProjectionCommandControllerOptions): void {
    const syncingProjectionRef = useRef<string | null>(null);
    const removingProjectionRef = useRef<string | null>(null);
    const {
      syncMissingRequest,
      syncSuccess,
      removeBlocked,
      removeSuccess,
    } = messages;

    const handleSyncProjection = useCallback(async (projectionKey: string) => {
      if (syncingProjectionRef.current) return;
      syncingProjectionRef.current = projectionKey;
      try {
        const synced = await commands.sync({
          projectId,
          canvasId,
          metadata,
          projectionKey,
        });
        onMessage(synced ? syncSuccess : syncMissingRequest);
      } catch (error) {
        onMessage(error instanceof Error ? error.message : String(error));
      } finally {
        syncingProjectionRef.current = null;
      }
    }, [canvasId, commands, metadata, onMessage, projectId, syncMissingRequest, syncSuccess]);

    const handleRemoveProjection = useCallback((projectionKey: string) => {
      if (removingProjectionRef.current) return;
      removingProjectionRef.current = projectionKey;
      try {
        const removed = commands.remove({ projectId, canvasId, projectionKey });
        onMessage(removed ? removeSuccess : removeBlocked);
      } catch (error) {
        onMessage(error instanceof Error ? error.message : String(error));
      } finally {
        removingProjectionRef.current = null;
      }
    }, [canvasId, commands, onMessage, projectId, removeBlocked, removeSuccess]);

    useEffect(() => {
      const unsubscribeSync = events.subscribe(
        "freezone/projection-sync",
        ({ projectionKey }) => {
          void handleSyncProjection(projectionKey);
        },
      );
      const unsubscribeRemove = events.subscribe(
        "freezone/projection-remove",
        ({ projectionKey }) => {
          handleRemoveProjection(projectionKey);
        },
      );

      return () => {
        unsubscribeSync();
        unsubscribeRemove();
      };
    }, [events, handleRemoveProjection, handleSyncProjection]);
  };
}
