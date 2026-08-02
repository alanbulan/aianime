// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  createCanvasUnloadSaver,
  type CanvasUnloadSaveArgs,
  type CanvasUnloadSaveDependencies,
} from "./canvasUnloadSave";

function args(
  overrides: Partial<CanvasUnloadSaveArgs> = {},
): CanvasUnloadSaveArgs {
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
    viewport: { x: 10, y: 20, zoom: 1.5 },
    metadata: { shotMetadata: {} },
    revision: 7,
    envelope: {},
    hydrated: true,
    switching: false,
    lastRemoteNodeCount: 0,
    mutationState: {
      userEditsSinceHydrate: 1,
      lastMutationSource: "user_edit",
      pendingClearIntent: false,
    },
    pendingClientSaveIdRef: { current: null },
    pendingClientSaveIdSignatureRef: { current: null },
    hasUnsettledContentSave: true,
    hasPendingContentSave: true,
    lastPersistedDraftSignature: null,
    cancelPendingDraft: vi.fn(),
    persistDraft: vi.fn(),
    cancelPendingContentSave: vi.fn(),
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<CanvasUnloadSaveDependencies> = {},
): CanvasUnloadSaveDependencies {
  return {
    generateClientSaveId: () => "save-a",
    persistViewport: vi.fn(),
    saveCanvasKeepalive: vi.fn(),
    ...overrides,
  };
}

describe("canvas unload save", () => {
  it("always persists the viewport without sending settled content", () => {
    const persistViewport = vi.fn();
    const saveCanvasKeepalive = vi.fn();
    const input = args({ hasUnsettledContentSave: false });
    const save = createCanvasUnloadSaver(
      dependencies({ persistViewport, saveCanvasKeepalive }),
    );

    expect(save(input)).toBe(false);

    expect(persistViewport).toHaveBeenCalledWith(
      "project-a",
      "canvas-a",
      input.viewport,
    );
    expect(input.persistDraft).not.toHaveBeenCalled();
    expect(saveCanvasKeepalive).not.toHaveBeenCalled();
  });

  it("persists a pending draft and sends one keepalive save", () => {
    const saveCanvasKeepalive = vi.fn();
    const input = args({ envelope: { project_id: "project-a" } });
    const save = createCanvasUnloadSaver(
      dependencies({ saveCanvasKeepalive }),
    );

    expect(save(input)).toBe(true);

    expect(input.cancelPendingDraft).toHaveBeenCalledTimes(1);
    expect(input.persistDraft).toHaveBeenCalledTimes(1);
    expect(input.cancelPendingContentSave).toHaveBeenCalledTimes(1);
    expect(saveCanvasKeepalive).toHaveBeenCalledWith(
      "project-a",
      "canvas-a",
      expect.objectContaining({
        project_id: "project-a",
        base_revision: 7,
        client_save_id: "save-a",
        save_source: "autosave",
        nodes: input.nodes,
      }),
    );
  });

  it("does not duplicate an in-flight save without a pending debounce", () => {
    const saveCanvasKeepalive = vi.fn();
    const input = args({ hasPendingContentSave: false });
    const save = createCanvasUnloadSaver(
      dependencies({ saveCanvasKeepalive }),
    );

    expect(save(input)).toBe(false);

    expect(input.persistDraft).toHaveBeenCalledTimes(1);
    expect(input.cancelPendingContentSave).not.toHaveBeenCalled();
    expect(saveCanvasKeepalive).not.toHaveBeenCalled();
  });

  it("preserves an explicit manual-clear save decision", () => {
    const saveCanvasKeepalive = vi.fn();
    const save = createCanvasUnloadSaver(
      dependencies({ saveCanvasKeepalive }),
    );

    expect(
      save(
        args({
          nodes: [],
          lastRemoteNodeCount: 1,
          mutationState: {
            userEditsSinceHydrate: 1,
            lastMutationSource: "manual_clear",
            pendingClearIntent: true,
          },
        }),
      ),
    ).toBe(true);

    expect(saveCanvasKeepalive).toHaveBeenCalledWith(
      "project-a",
      "canvas-a",
      expect.objectContaining({
        save_source: "manual_clear",
        allow_empty_overwrite: true,
        nodes: [],
      }),
    );
  });
});
