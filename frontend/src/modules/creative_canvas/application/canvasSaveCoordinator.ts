// Copyright (c) 2026 AI anime

export interface CanvasSaveSession {
  readonly canvasKey: string;
  readonly generation: number;
  isDisposed(): boolean;
  isSaving(): boolean;
  contentVersion(): number;
  savedVersion(): number;
  hasUnsavedContentBeyond(version: number): boolean;
  requestSave(): Promise<boolean>;
  dispose(): void;
}

export interface CanvasSaveSessionOptions {
  canvasKey: string;
  generation: number;
  runSave(
    version: number,
    session: CanvasSaveSession,
  ): Promise<boolean>;
}

interface SaveWaiter {
  version: number;
  resolve(persisted: boolean): void;
}

/**
 * Serializes saves for one loaded canvas. Edits made while a request is in
 * flight collapse into one follow-up request which reads the live store.
 */
export function createCanvasSaveSession(
  options: CanvasSaveSessionOptions,
): CanvasSaveSession {
  let contentVersion = 0;
  let savedVersion = 0;
  let pendingVersion: number | null = null;
  let pumping = false;
  let disposed = false;
  const waiters: SaveWaiter[] = [];

  const settle = (upTo: number, persisted: boolean): void => {
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      if (waiter && waiter.version <= upTo) {
        waiters.splice(index, 1);
        waiter.resolve(persisted);
      }
    }
  };

  const session: CanvasSaveSession = {
    canvasKey: options.canvasKey,
    generation: options.generation,
    isDisposed: () => disposed,
    isSaving: () => pumping,
    contentVersion: () => contentVersion,
    savedVersion: () => savedVersion,
    hasUnsavedContentBeyond: (version) =>
      pendingVersion !== null || contentVersion > version,
    requestSave: () => {
      if (disposed) return Promise.resolve(false);
      const version = (contentVersion += 1);
      pendingVersion = version;
      const landed = new Promise<boolean>((resolve) => {
        waiters.push({ version, resolve });
      });
      startPump();
      return landed;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      pendingVersion = null;
      settle(Number.POSITIVE_INFINITY, false);
    },
  };

  async function pump(): Promise<void> {
    while (!disposed && pendingVersion !== null) {
      const version = pendingVersion;
      pendingVersion = null;
      let persisted = false;
      try {
        persisted = await options.runSave(version, session);
      } catch {
        persisted = false;
      }
      if (disposed) return;
      if (!persisted) {
        pendingVersion = null;
        settle(Number.POSITIVE_INFINITY, false);
        return;
      }
      savedVersion = Math.max(savedVersion, version);
      settle(savedVersion, true);
    }
  }

  function startPump(): void {
    if (pumping) return;
    pumping = true;
    void (async () => {
      try {
        await pump();
      } finally {
        pumping = false;
        if (!disposed && pendingVersion !== null) startPump();
      }
    })();
  }

  return session;
}
