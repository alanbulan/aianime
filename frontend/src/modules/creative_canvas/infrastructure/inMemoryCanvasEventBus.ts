// Copyright (c) 2026 AI anime
import type {
  CanvasEventBus,
  CanvasEventMap,
} from "../application/canvasEventBus";

export class InMemoryCanvasEventBus implements CanvasEventBus {
  private readonly listeners = new Map<
    keyof CanvasEventMap,
    Set<(payload: unknown) => void>
  >();

  publish<TType extends keyof CanvasEventMap>(
    type: TType,
    payload: CanvasEventMap[TType],
  ): void {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(payload);
    }
  }

  subscribe<TType extends keyof CanvasEventMap>(
    type: TType,
    handler: (payload: CanvasEventMap[TType]) => void,
  ): () => void {
    const handlers = this.listeners.get(type) ?? new Set();
    handlers.add(handler as (payload: unknown) => void);
    this.listeners.set(type, handlers);

    return () => {
      handlers.delete(handler as (payload: unknown) => void);
      if (handlers.size === 0) {
        this.listeners.delete(type);
      }
    };
  }
}
