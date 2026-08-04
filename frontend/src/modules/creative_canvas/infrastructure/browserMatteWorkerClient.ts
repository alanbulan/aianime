// Copyright (c) 2026 AI anime
type MatteWorkerOutboundMessage =
  | { type: 'ready'; id: number }
  | { type: 'result'; id: number; blob: Blob }
  | { type: 'error'; id: number; message: string };

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<
  number,
  { resolve: (blob: Blob) => void; reject: (error: Error) => void }
>();

function ensureWorker(): Worker {
  if (worker) {
    return worker;
  }
  worker = new Worker(new URL('./matteWorker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = (event: MessageEvent<MatteWorkerOutboundMessage>) => {
    const message = event.data;
    if (message.type === 'ready') {
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) {
      return;
    }
    pending.delete(message.id);
    if (message.type === 'result') {
      entry.resolve(message.blob);
    } else {
      entry.reject(new Error(message.message));
    }
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || 'matte worker crashed');
    for (const entry of pending.values()) {
      entry.reject(error);
    }
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function preloadBrowserMatteWorker(): void {
  ensureWorker().postMessage({ type: 'preload', id: 0 });
}

export function matteImageInBrowserWorker(blob: Blob): Promise<Blob> {
  const target = ensureWorker();
  const id = nextRequestId++;
  return new Promise<Blob>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    target.postMessage({ type: 'matte', id, blob });
  });
}
