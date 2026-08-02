// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFreezoneShellController } from "./useFreezoneShellController";

const mocks = vi.hoisted(() => ({
  addNode: vi.fn(),
  ceRuntime: false,
  commitController: {
    prompt: null as Record<string, unknown> | null,
    closePrompt: vi.fn(),
    getPromptNodeData: vi.fn(),
    handlePromptSuccess: vi.fn(),
    handleAssetReplaced: vi.fn(),
  },
  commitOptions: null as Record<string, unknown> | null,
  entryOptions: null as Record<string, unknown> | null,
  entryState: {
    showBlockingLoading: false,
    showLoadingOverlay: true,
  },
  projectionCommandOptions: null as Record<string, unknown> | null,
  projectionStatusOptions: null as Record<string, unknown> | null,
  syncArgs: null as [string, string] | null,
  sync: {
    status: "ready",
    error: null as string | null,
    metadata: { revision_source: "remote" } as Record<string, unknown> | null,
    revision: 4 as number | null,
    hydratedCanvasId: "canvas-a" as string | null,
    backupStatus: null,
    flush: vi.fn().mockResolvedValue(true),
    retry: vi.fn(),
    saveCopy: vi.fn().mockResolvedValue("canvas-copy"),
    restoreMainlineDefault: vi.fn().mockResolvedValue("canvas-a"),
    readConflictSnapshot: vi.fn(),
  },
  writeUrl: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => `translated:${key}` }),
}));

vi.mock("@/features/canvas/canvasStore", () => ({
  useCanvasStore: {
    getState: () => ({ addNode: mocks.addNode }),
  },
}));

vi.mock("@/modules/creative_canvas/public", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/modules/creative_canvas/public")
  >();
  return {
    ...actual,
    createCanvasCommitControllerHook: () =>
      (options: Record<string, unknown>) => {
        mocks.commitOptions = options;
        return mocks.commitController;
      },
    useCanvasProjectionCommandController: (
      options: Record<string, unknown>,
    ) => {
      mocks.projectionCommandOptions = options;
    },
    useCanvasProjectionStatusLifecycle: (
      options: Record<string, unknown>,
    ) => {
      mocks.projectionStatusOptions = options;
    },
  };
});

vi.mock("@/lib/runtime-config", () => ({
  isCeRuntime: () => mocks.ceRuntime,
}));

vi.mock("@/lib/url-params", () => ({
  writeUrl: (...args: unknown[]) => mocks.writeUrl(...args),
}));

vi.mock("./useCanvasSync", () => ({
  useCanvasSync: (projectId: string, canvasId: string) => {
    mocks.syncArgs = [projectId, canvasId];
    return mocks.sync;
  },
}));

vi.mock("./useFreezoneCanvasEntryLifecycle", () => ({
  useFreezoneCanvasEntryLifecycle: (options: Record<string, unknown>) => {
    mocks.entryOptions = options;
    return mocks.entryState;
  },
}));

describe("useFreezoneShellController", () => {
  beforeEach(() => {
    mocks.addNode.mockReset();
    mocks.ceRuntime = false;
    mocks.commitController.prompt = null;
    mocks.commitController.closePrompt.mockReset();
    mocks.commitController.getPromptNodeData.mockReset();
    mocks.commitController.handlePromptSuccess.mockReset();
    mocks.commitController.handleAssetReplaced.mockReset();
    mocks.commitOptions = null;
    mocks.entryOptions = null;
    mocks.entryState.showBlockingLoading = false;
    mocks.entryState.showLoadingOverlay = true;
    mocks.projectionCommandOptions = null;
    mocks.projectionStatusOptions = null;
    mocks.syncArgs = null;
    mocks.sync.status = "ready";
    mocks.sync.error = null;
    mocks.sync.metadata = { revision_source: "remote" };
    mocks.sync.revision = 4;
    mocks.sync.hydratedCanvasId = "canvas-a";
    mocks.sync.flush.mockReset().mockResolvedValue(true);
    mocks.sync.retry.mockReset();
    mocks.sync.saveCopy.mockReset().mockResolvedValue("canvas-copy");
    mocks.sync.restoreMainlineDefault.mockReset().mockResolvedValue("canvas-a");
    mocks.sync.readConflictSnapshot.mockReset();
    mocks.writeUrl.mockReset();
  });

  it("assembles canvas sync, lifecycle, projection, and commit controllers", () => {
    const { result } = renderHook(() =>
      useFreezoneShellController({
        projectId: "project-a",
        canvasId: "canvas-a",
      }),
    );

    expect(mocks.syncArgs).toEqual(["project-a", "canvas-a"]);
    expect(mocks.entryOptions).toEqual({
      projectId: "project-a",
      canvasId: "canvas-a",
      hydratedCanvasId: "canvas-a",
      syncStatus: "ready",
    });
    expect(mocks.projectionStatusOptions).toMatchObject({
      projectId: "project-a",
      canvasId: "canvas-a",
      metadata: { revision_source: "remote" },
      revision: 4,
      syncStatus: "ready",
    });
    expect(mocks.projectionCommandOptions).toMatchObject({
      projectId: "project-a",
      canvasId: "canvas-a",
      messages: {
        syncMissingRequest: "translated:freezone.projections.syncMissingRequest",
        syncSuccess: "translated:freezone.projections.syncSuccess",
        removeBlocked: "translated:freezone.projections.removeBlocked",
        removeSuccess: "translated:freezone.projections.removeSuccess",
      },
    });
    expect(mocks.commitOptions).toMatchObject({
      projectId: "project-a",
      flush: mocks.sync.flush,
    });
    expect(result.current).toMatchObject({
      projectId: "project-a",
      canvasId: "canvas-a",
      canvas: {
        showBlockingLoading: false,
        showLoadingOverlay: true,
        status: "ready",
      },
      chat: {
        visible: true,
        title: "translated:freezone.chat.title",
      },
    });
  });

  it("owns panel state, chat state, asset refreshes, and toast messages", () => {
    const { result } = renderHook(() =>
      useFreezoneShellController({
        projectId: "project-a",
        canvasId: "canvas-a",
      }),
    );

    act(() => {
      result.current.assetLibrary.setCollapsed(false);
      result.current.chat.setOpen(true);
    });
    expect(result.current.assetLibrary.collapsed).toBe(false);
    expect(result.current.chat.open).toBe(true);

    act(() => result.current.canvas.onBlankPaneClick());
    expect(result.current.assetLibrary.collapsed).toBe(true);
    expect(result.current.chat.open).toBe(false);

    act(() => {
      const onAssetsChanged = mocks.commitOptions?.onAssetsChanged as () => void;
      onAssetsChanged();
    });
    expect(result.current.assetLibrary.reloadToken).toBe(1);

    act(() => {
      const onMessage = mocks.commitOptions?.onMessage as (message: string) => void;
      onMessage("提交完成");
    });
    expect(result.current.toast?.text).toBe("提交完成");
    act(() => result.current.toast?.close());
    expect(result.current.toast).toBeNull();
  });

  it("saves a conflict copy and reports mainline restore results", async () => {
    const { result } = renderHook(() =>
      useFreezoneShellController({
        projectId: "project-a",
        canvasId: "canvas-a",
      }),
    );

    await act(async () => result.current.canvas.saveConflictCopy());
    expect(mocks.sync.saveCopy).toHaveBeenCalledOnce();
    expect(mocks.writeUrl).toHaveBeenCalledWith({ canvas: "canvas-copy" });
    expect(result.current.assetLibrary.reloadToken).toBe(1);

    await act(async () => result.current.assetLibrary.restoreMainlineDefault());
    expect(result.current.toast?.text).toBe("已按当前主流程事实同步主线视图");

    mocks.sync.restoreMainlineDefault.mockRejectedValueOnce(new Error("恢复失败"));
    await act(async () => result.current.assetLibrary.restoreMainlineDefault());
    expect(result.current.toast?.text).toBe("恢复失败");
  });

  it("hides the chat dock in the CE runtime", () => {
    mocks.ceRuntime = true;

    const { result } = renderHook(() =>
      useFreezoneShellController({
        projectId: "project-a",
        canvasId: "canvas-a",
      }),
    );

    expect(result.current.chat.visible).toBe(false);
    expect(result.current.chat.open).toBe(false);
  });
});
