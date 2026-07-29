// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  createCanvasConflictRecovery,
  type CanvasConflictRecoveryDependencies,
} from "./canvasConflictRecovery";
import type { ConflictSnapshot } from "./canvasSyncStorage";

const SNAPSHOT: ConflictSnapshot = {
  canvas_id: "canvas-a",
  nodes: [{ id: "node-a" }],
  edges: [],
  viewport: { x: 10, y: 20, zoom: 1.5 },
  metadata: { preset: { scope: "blank" } },
  timestamp: "2026-07-28T00:00:00Z",
};

function dependencies(
  overrides: Partial<CanvasConflictRecoveryDependencies> = {},
): CanvasConflictRecoveryDependencies {
  return {
    readConflictSnapshot: vi.fn(() => SNAPSHOT),
    writeConflictSnapshot: vi.fn(),
    clearConflictSnapshot: vi.fn(),
    clearDraft: vi.fn(),
    createCopyCanvasId: () => "copy-a",
    generateClientSaveId: () => "save-a",
    saveCanvas: async () => ({
      saved: true,
      revision: 1,
      backup_status: "synced",
    }),
    nowIso: () => "2026-07-28T01:00:00Z",
    ...overrides,
  };
}

describe("canvas conflict recovery", () => {
  it("captures, reads and clears a conflict snapshot through storage ports", () => {
    const writeConflictSnapshot = vi.fn();
    const clearConflictSnapshot = vi.fn();
    const recovery = createCanvasConflictRecovery(
      dependencies({ writeConflictSnapshot, clearConflictSnapshot }),
    );

    recovery.capture({
      canvasId: "canvas-a",
      nodes: SNAPSHOT.nodes,
      edges: SNAPSHOT.edges,
      viewport: SNAPSHOT.viewport,
      metadata: SNAPSHOT.metadata,
      timestamp: SNAPSHOT.timestamp,
    });

    expect(writeConflictSnapshot).toHaveBeenCalledWith(SNAPSHOT);
    expect(recovery.readSnapshot("canvas-a")).toBe(SNAPSHOT);
    recovery.clearSnapshot("canvas-a");
    expect(clearConflictSnapshot).toHaveBeenCalledWith("canvas-a");
  });

  it("clears both the conflict snapshot and recovery draft when discarded", () => {
    const clearConflictSnapshot = vi.fn();
    const clearDraft = vi.fn();
    const recovery = createCanvasConflictRecovery(
      dependencies({ clearConflictSnapshot, clearDraft }),
    );

    recovery.discard("project-a", "canvas-a");

    expect(clearConflictSnapshot).toHaveBeenCalledWith("canvas-a");
    expect(clearDraft).toHaveBeenCalledWith("project-a", "canvas-a");
  });

  it("saves the captured edits as a fresh canvas before clearing recovery data", async () => {
    const saveCanvas = vi.fn(async () => ({
      saved: true,
      revision: 3,
      backup_status: "pending" as const,
    }));
    const clearConflictSnapshot = vi.fn();
    const clearDraft = vi.fn();
    const recovery = createCanvasConflictRecovery(
      dependencies({ saveCanvas, clearConflictSnapshot, clearDraft }),
    );

    await expect(
      recovery.saveCopy({
        project: "project-a",
        sourceCanvasId: "canvas-a",
        envelope: { project_id: "project-a", revision: 7 },
        shotMetadata: { angle: "low angle" },
      }),
    ).resolves.toEqual({
      canvasId: "copy-a",
      revision: 3,
      backupStatus: "pending",
    });

    expect(saveCanvas).toHaveBeenCalledWith(
      "project-a",
      "copy-a",
      expect.objectContaining({
        project_id: "project-a",
        canvas_id: "copy-a",
        revision: undefined,
        base_revision: undefined,
        nodes: SNAPSHOT.nodes,
        edges: SNAPSHOT.edges,
        viewport: SNAPSHOT.viewport,
        client_save_id: "save-a",
        save_source: "manual_save",
        allow_empty_overwrite: false,
        metadata: expect.objectContaining({
          canvas_origin: "conflict_copy",
          source_canvas_id: "canvas-a",
          shotMetadata: { angle: "low angle" },
        }),
      }),
    );
    expect(clearConflictSnapshot).toHaveBeenCalledWith("canvas-a");
    expect(clearDraft).toHaveBeenCalledWith("project-a", "canvas-a");
  });

  it("keeps recovery data when no snapshot exists or the copy save fails", async () => {
    const clearConflictSnapshot = vi.fn();
    const clearDraft = vi.fn();
    const missing = createCanvasConflictRecovery(
      dependencies({
        readConflictSnapshot: () => null,
        clearConflictSnapshot,
        clearDraft,
      }),
    );
    const input = {
      project: "project-a",
      sourceCanvasId: "canvas-a",
      envelope: {},
      shotMetadata: {},
    };

    await expect(missing.saveCopy(input)).rejects.toThrow(
      "No local conflict snapshot is available to save.",
    );

    const failed = createCanvasConflictRecovery(
      dependencies({
        saveCanvas: async () => {
          throw new Error("save failed");
        },
        clearConflictSnapshot,
        clearDraft,
      }),
    );
    await expect(failed.saveCopy(input)).rejects.toThrow("save failed");
    expect(clearConflictSnapshot).not.toHaveBeenCalled();
    expect(clearDraft).not.toHaveBeenCalled();
  });
});
