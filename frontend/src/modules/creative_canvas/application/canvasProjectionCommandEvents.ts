// Copyright (c) 2026 AI anime
export type CanvasProjectionCommandEventType =
  | "freezone/projection-sync"
  | "freezone/projection-remove";

export interface CanvasProjectionCommandEventPayload {
  projectionKey: string;
}

export interface CanvasProjectionCommandEventSource {
  subscribe(
    type: CanvasProjectionCommandEventType,
    handler: (payload: CanvasProjectionCommandEventPayload) => void,
  ): () => void;
}

const listeners = new Map<
  CanvasProjectionCommandEventType,
  Set<(payload: CanvasProjectionCommandEventPayload) => void>
>();

export const canvasProjectionCommandEvents: CanvasProjectionCommandEventSource = {
  subscribe(type, handler) {
    const eventListeners = listeners.get(type) ?? new Set();
    eventListeners.add(handler);
    listeners.set(type, eventListeners);
    return () => {
      eventListeners.delete(handler);
      if (eventListeners.size === 0) listeners.delete(type);
    };
  },
};

export function publishCanvasProjectionSyncRequested(
  projectionKey: string,
): void {
  publish("freezone/projection-sync", projectionKey);
}

export function publishCanvasProjectionRemovalRequested(
  projectionKey: string,
): void {
  publish("freezone/projection-remove", projectionKey);
}

function publish(
  type: CanvasProjectionCommandEventType,
  projectionKey: string,
): void {
  for (const handler of listeners.get(type) ?? []) {
    handler({ projectionKey });
  }
}
