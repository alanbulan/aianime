// Copyright (c) 2026 AI anime
export interface CanvasCommitRequest {
  nodeId: string;
  auto?: boolean;
  successMessage?: string;
}

export interface CanvasCommitEventSource {
  subscribeCommit(handler: (request: CanvasCommitRequest) => void): () => void;
  subscribeAssetsChanged(handler: () => void): () => void;
}

const commitListeners = new Set<(request: CanvasCommitRequest) => void>();
const assetsChangedListeners = new Set<() => void>();

export const canvasCommitEvents: CanvasCommitEventSource = {
  subscribeCommit(handler) {
    commitListeners.add(handler);
    return () => commitListeners.delete(handler);
  },
  subscribeAssetsChanged(handler) {
    assetsChangedListeners.add(handler);
    return () => assetsChangedListeners.delete(handler);
  },
};

export function publishCanvasCommitRequested(request: CanvasCommitRequest): void {
  for (const handler of commitListeners) handler(request);
}

export function publishCanvasAssetsUpdated(): void {
  for (const handler of assetsChangedListeners) handler();
}
