// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  createCanvasSaveScheduler,
  type CanvasSaveArgs,
  type CanvasSaveDependencies,
} from "./canvasSave";

function args(overrides: Partial<CanvasSaveArgs> = {}): CanvasSaveArgs {
  return {
    project: "project-a",
    canvasId: "canvas-a",
    nodes: [
      {
        id: "node-a",
        type: "uploadImageNode",
        position: { x: 0, y: 0 },
        data: { label: "node" },
      },
    ],
    edges: [],
    revisionRef: { current: 1 },
    canvasEnvelopeRef: { current: {} },
    pendingClientSaveIdRef: { current: null },
    pendingClientSaveIdSignatureRef: { current: null },
    hydratedRef: { current: true },
    switchingRef: { current: false },
    lastRemoteNodeCountRef: { current: 1 },
    setStatus: vi.fn(),
    setError: vi.fn(),
    inFlightRef: { current: null },
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<CanvasSaveDependencies> = {},
): CanvasSaveDependencies {
  return {
    readCanvasState: () => ({
      nodeCount: 1,
      edgeCount: 0,
      userEditsSinceHydrate: 1,
      lastMutationSource: "user_edit",
      pendingClearIntent: false,
    }),
    generateClientSaveId: () => "save-a",
    saveCanvas: async () => ({ saved: true, revision: 2 }),
    clearDraft: vi.fn(),
    acknowledgePendingClear: vi.fn(),
    sleep: async () => undefined,
    warn: vi.fn(),
    captureConflict: vi.fn(),
    ...overrides,
  };
}

describe("canvas save scheduler", () => {
  it("saves once and publishes the server revision", async () => {
    const saveCanvas = vi.fn<CanvasSaveDependencies["saveCanvas"]>(async () => ({
      saved: true,
      revision: 2,
      updated_at: "2026-07-28T00:00:00Z",
      backup_status: "synced" as const,
    }));
    const clearDraft = vi.fn();
    const publishRevision = vi.fn();
    const publishBackupStatus = vi.fn();
    const input = args({ publishRevision, publishBackupStatus });
    const schedule = createCanvasSaveScheduler(
      dependencies({ saveCanvas, clearDraft }),
    );

    await expect(schedule(input)).resolves.toBe(true);

    expect(saveCanvas).toHaveBeenCalledTimes(1);
    expect(saveCanvas.mock.calls[0]?.[2]).toMatchObject({
      canvas_id: "canvas-a",
      base_revision: 1,
      client_save_id: "save-a",
      save_source: "autosave",
    });
    expect(input.revisionRef.current).toBe(2);
    expect(input.canvasEnvelopeRef.current).toMatchObject({
      revision: 2,
      updated_at: "2026-07-28T00:00:00Z",
    });
    expect(publishRevision).toHaveBeenCalledWith(2);
    expect(publishBackupStatus).toHaveBeenCalledWith("synced");
    expect(clearDraft).toHaveBeenCalledWith("project-a", "canvas-a");
    expect(input.setStatus).toHaveBeenLastCalledWith("ready");
    expect(input.pendingClientSaveIdRef.current).toBeNull();
  });

  it("blocks an unintentional empty overwrite before calling the gateway", async () => {
    const saveCanvas = vi.fn();
    const input = args({
      nodes: [],
      lastRemoteNodeCountRef: { current: 2 },
    });
    const schedule = createCanvasSaveScheduler(
      dependencies({
        readCanvasState: () => ({
          nodeCount: 0,
          edgeCount: 0,
          userEditsSinceHydrate: 0,
          lastMutationSource: null,
          pendingClearIntent: false,
        }),
        saveCanvas,
      }),
    );

    await expect(schedule(input)).resolves.toBe(false);

    expect(saveCanvas).not.toHaveBeenCalled();
    expect(input.setStatus).toHaveBeenLastCalledWith("conflict");
    expect(input.setError).toHaveBeenLastCalledWith(
      expect.stringContaining("服务器还有节点"),
    );
  });

  it("retries a lock-busy response with the same client save id", async () => {
    const saveCanvas = vi
      .fn<CanvasSaveDependencies["saveCanvas"]>()
      .mockRejectedValueOnce({
        status: 503,
        body: { detail: { code: "canvas_lock_busy" } },
      })
      .mockResolvedValueOnce({ saved: true, revision: 2 });
    const sleep = vi.fn(async () => undefined);
    const schedule = createCanvasSaveScheduler(
      dependencies({ saveCanvas, sleep }),
    );

    await expect(schedule(args())).resolves.toBe(true);

    expect(sleep).toHaveBeenCalledWith(1_000);
    expect(saveCanvas).toHaveBeenCalledTimes(2);
    expect(saveCanvas.mock.calls[0]?.[2].client_save_id).toBe("save-a");
    expect(saveCanvas.mock.calls[1]?.[2].client_save_id).toBe("save-a");
  });

  it("captures a revision conflict through the application port", async () => {
    const captureConflict = vi.fn();
    const input = args({
      viewport: { x: 10, y: 20, zoom: 1.5 },
      metadata: { shotMetadata: {} },
    });
    const schedule = createCanvasSaveScheduler(
      dependencies({
        saveCanvas: async () => {
          throw { status: 409, body: {} };
        },
        captureConflict,
      }),
    );

    await expect(schedule(input)).resolves.toBe(false);

    expect(captureConflict).toHaveBeenCalledWith({
      canvasId: "canvas-a",
      nodes: input.nodes,
      edges: input.edges,
      viewport: input.viewport,
      metadata: input.metadata,
    });
    expect(input.setStatus).toHaveBeenLastCalledWith("conflict");
  });
});
