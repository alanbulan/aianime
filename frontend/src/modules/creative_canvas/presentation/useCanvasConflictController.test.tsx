// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createUseCanvasConflictController,
  type CanvasConflictControllerOptions,
} from "./useCanvasConflictController";

const mocks = {
  capture: vi.fn(),
  clearSnapshot: vi.fn(),
  discard: vi.fn(),
  readSnapshot: vi.fn(),
  saveCopy: vi.fn(),
  shot: { shot_type: "medium" },
};

const useCanvasConflictController = createUseCanvasConflictController({
  recovery: {
    capture: mocks.capture,
    clearSnapshot: mocks.clearSnapshot,
    discard: mocks.discard,
    readSnapshot: mocks.readSnapshot,
    saveCopy: mocks.saveCopy,
  },
  readShotMetadata: () => mocks.shot,
});

function createOptions(
  overrides: Partial<CanvasConflictControllerOptions> = {},
): CanvasConflictControllerOptions {
  return {
    project: "project-a",
    canvasId: "canvas-a",
    canvasEnvelopeRef: { current: { schema_version: 2 } },
    revisionRef: { current: 7 },
    saveController: { resetIdentity: vi.fn() },
    reload: vi.fn(),
    setRevision: vi.fn(),
    setBackupStatus: vi.fn(),
    setStatus: vi.fn(),
    setError: vi.fn(),
    ...overrides,
  };
}

describe("canvas conflict controller", () => {
  beforeEach(() => {
    mocks.clearSnapshot.mockReset();
    mocks.discard.mockReset();
    mocks.readSnapshot.mockReset().mockReturnValue({
      canvas_id: "canvas-a",
      nodes: [],
      edges: [],
      viewport: null,
      metadata: null,
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    mocks.saveCopy.mockReset().mockResolvedValue({
      canvasId: "copy-a",
      revision: 3,
      backupStatus: "synced",
    });
  });

  it("discards recovery data before retrying and delegates snapshot commands", () => {
    const options = createOptions();
    const hook = renderHook(() => useCanvasConflictController(options));

    act(() => {
      hook.result.current.retry();
    });
    expect(mocks.discard).toHaveBeenCalledWith("project-a", "canvas-a");
    expect(options.reload).toHaveBeenCalledTimes(1);
    expect(hook.result.current.readConflictSnapshot()).toMatchObject({
      canvas_id: "canvas-a",
    });
    expect(mocks.readSnapshot).toHaveBeenCalledWith("canvas-a");

    act(() => {
      hook.result.current.clearConflictSnapshot();
    });
    expect(mocks.clearSnapshot).toHaveBeenCalledWith("canvas-a");
  });

  it("saves a conflict copy and resets the active save state", async () => {
    const options = createOptions();
    const hook = renderHook(() => useCanvasConflictController(options));
    let copyCanvasId = "";

    await act(async () => {
      copyCanvasId = await hook.result.current.saveCopy();
    });

    expect(copyCanvasId).toBe("copy-a");
    expect(mocks.saveCopy).toHaveBeenCalledWith({
      project: "project-a",
      sourceCanvasId: "canvas-a",
      envelope: { schema_version: 2 },
      shotMetadata: mocks.shot,
    });
    expect(options.revisionRef.current).toBe(3);
    expect(options.setRevision).toHaveBeenCalledWith(3);
    expect(options.setBackupStatus).toHaveBeenCalledWith("synced");
    expect(options.saveController.resetIdentity).toHaveBeenCalledTimes(1);
    expect(options.setStatus).toHaveBeenCalledWith("ready");
    expect(options.setError).toHaveBeenCalledWith(null);
  });
});
