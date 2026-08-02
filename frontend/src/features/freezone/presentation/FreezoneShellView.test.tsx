// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FreezoneShellController } from "../hooks/useFreezoneShellController";
import { FreezoneShellView } from "./FreezoneShellView";

vi.mock("@/features/canvas/Canvas", () => ({
  Canvas: ({
    projectId,
    canvasId,
    onBlankPaneClick,
  }: {
    projectId: string;
    canvasId: string;
    onBlankPaneClick(): void;
  }) => (
    <button
      type="button"
      data-project-id={projectId}
      data-canvas-id={canvasId}
      onClick={onBlankPaneClick}
    >canvas</button>
  ),
}));

vi.mock("@/features/canvas/ui/NodeReplaceDragPreview", () => ({
  NodeReplaceDragPreview: () => <div>drag-preview</div>,
}));

vi.mock("./AssetLibraryPanel", () => ({
  AssetLibraryPanel: ({
    project,
    currentCanvasId,
    reloadToken,
    onCollapsedChange,
    onRestoreMainlineDefault,
  }: {
    project: string;
    currentCanvasId: string;
    reloadToken: number;
    onCollapsedChange(collapsed: boolean): void;
    onRestoreMainlineDefault(): void;
  }) => (
    <div>
      <div>{project}:{currentCanvasId}:{reloadToken}</div>
      <button type="button" onClick={() => onCollapsedChange(false)}>expand-assets</button>
      <button type="button" onClick={onRestoreMainlineDefault}>restore-mainline</button>
    </div>
  ),
}));

vi.mock("@/modules/creative_canvas/public", () => ({
  FreezoneChatDock: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange(open: boolean): void;
  }) => (
    <button type="button" onClick={() => onOpenChange(!open)}>chat:{String(open)}</button>
  ),
  BackupStatusIndicator: () => <div>backup-status</div>,
  CanvasConflictOverlay: ({
    onRefresh,
    onSaveCopy,
  }: {
    onRefresh(): void;
    onSaveCopy(): void;
  }) => (
    <div>
      <button type="button" onClick={onRefresh}>refresh-conflict</button>
      <button type="button" onClick={onSaveCopy}>save-copy</button>
    </div>
  ),
  CanvasErrorOverlay: ({ onRetry }: { onRetry(): void }) => (
    <button type="button" onClick={onRetry}>retry-error</button>
  ),
  CanvasLoadingOverlay: () => <div>loading-overlay</div>,
  CanvasLoadingScreen: () => <div>loading-screen</div>,
  FreezoneToast: ({ text, onClose }: { text: string; onClose(): void }) => (
    <button type="button" onClick={onClose}>toast:{text}</button>
  ),
}));

vi.mock("./CommitDialog", () => ({
  CommitDialog: ({ onClose }: { onClose(): void }) => (
    <button type="button" onClick={onClose}>commit-dialog</button>
  ),
}));

vi.mock("./CreateIdentityDialog", () => ({
  CreateIdentityDialog: ({ onSuccess }: { onSuccess(message: string): void }) => (
    <button type="button" onClick={() => onSuccess("identity-created")}>
      identity-dialog
    </button>
  ),
}));

vi.mock("./CompareDialog", () => ({
  CompareDialog: ({ onClose }: { onClose(): void }) => (
    <button type="button" onClick={onClose}>compare-dialog</button>
  ),
}));

vi.mock("./MaskEditor", () => ({
  MaskEditor: ({ onResult }: { onResult(url: string): void }) => (
    <button type="button" onClick={() => onResult("mask-result.png")}>mask-editor</button>
  ),
}));

function createController(): FreezoneShellController {
  return {
    projectId: "project-a",
    canvasId: "canvas-a",
    canvas: {
      showBlockingLoading: false,
      showLoadingOverlay: false,
      status: "ready",
      error: null,
      retry: vi.fn(),
      saveConflictCopy: vi.fn(),
      readConflictSnapshot: vi.fn(),
      backupStatus: null,
      onBlankPaneClick: vi.fn(),
    },
    assetLibrary: {
      metadata: null,
      collapsed: true,
      setCollapsed: vi.fn(),
      reloadToken: 3,
      restoreMainlineDefault: vi.fn(),
      onReplaced: vi.fn(),
    },
    chat: {
      visible: true,
      open: false,
      setOpen: vi.fn(),
      title: "对话",
      description: "描述",
      toggleLabel: "打开对话",
    },
    commitDialog: null,
    createIdentityDialog: null,
    compareDialog: null,
    maskEditor: null,
    toast: null,
  } as unknown as FreezoneShellController;
}

describe("FreezoneShellView", () => {
  it("renders the canvas, asset panel, chat dock, and their commands", () => {
    const controller = createController();
    render(<FreezoneShellView controller={controller} />);

    expect(screen.getByText("project-a:canvas-a:3")).toBeInTheDocument();
    expect(screen.getByText("drag-preview")).toBeInTheDocument();
    expect(screen.getByText("backup-status")).toBeInTheDocument();
    const canvas = screen.getByRole("button", { name: "canvas" });
    expect(canvas).toHaveAttribute("data-project-id", "project-a");
    expect(canvas).toHaveAttribute("data-canvas-id", "canvas-a");
    fireEvent.click(canvas);
    fireEvent.click(screen.getByRole("button", { name: "expand-assets" }));
    fireEvent.click(screen.getByRole("button", { name: "restore-mainline" }));
    fireEvent.click(screen.getByRole("button", { name: "chat:false" }));
    expect(controller.canvas.onBlankPaneClick).toHaveBeenCalledOnce();
    expect(controller.assetLibrary.setCollapsed).toHaveBeenCalledWith(false);
    expect(controller.assetLibrary.restoreMainlineDefault).toHaveBeenCalledOnce();
    expect(controller.chat.setOpen).toHaveBeenCalledWith(true);
  });

  it("renders blocking, loading, error, and conflict feedback states", () => {
    const blocking = createController();
    blocking.canvas.showBlockingLoading = true;
    blocking.canvas.showLoadingOverlay = true;
    blocking.canvas.status = "error";
    const { rerender } = render(<FreezoneShellView controller={blocking} />);

    expect(screen.getByText("loading-screen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "canvas" })).toBeNull();
    expect(screen.getByText("loading-overlay")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "retry-error" }));
    expect(blocking.canvas.retry).toHaveBeenCalledOnce();

    const conflict = createController();
    conflict.canvas.status = "conflict";
    rerender(<FreezoneShellView controller={conflict} />);
    fireEvent.click(screen.getByRole("button", { name: "refresh-conflict" }));
    fireEvent.click(screen.getByRole("button", { name: "save-copy" }));
    expect(conflict.canvas.retry).toHaveBeenCalledOnce();
    expect(conflict.canvas.saveConflictCopy).toHaveBeenCalledOnce();
  });

  it("renders shell dialogs and toast from controller state", () => {
    const controller = createController();
    const closeCommit = vi.fn();
    const succeedIdentity = vi.fn();
    const closeCompare = vi.fn();
    const succeedMask = vi.fn();
    const closeToast = vi.fn();
    controller.commitDialog = {
      prompt: {
        nodeId: "node-a",
        sourceUrl: "source.png",
        previewUrl: null,
        sourceLabel: "source",
        mediaType: "image",
      },
      getNodeData: vi.fn(),
      close: closeCommit,
      succeed: vi.fn(),
    };
    controller.createIdentityDialog = {
      source: {
        nodeId: "node-a",
        imageUrl: "source.png",
        previewUrl: null,
        label: "source",
      },
      defaultCharacter: "Alice",
      close: vi.fn(),
      succeed: succeedIdentity,
    };
    controller.compareDialog = {
      pair: {
        left: { url: "left.png", label: "left" },
        right: { url: "right.png", label: "right" },
      },
      close: closeCompare,
    };
    controller.maskEditor = {
      target: { url: "source.png", label: "source" },
      close: vi.fn(),
      succeed: succeedMask,
    };
    controller.toast = { text: "完成", close: closeToast };

    render(<FreezoneShellView controller={controller} />);
    fireEvent.click(screen.getByRole("button", { name: "commit-dialog" }));
    fireEvent.click(screen.getByRole("button", { name: "identity-dialog" }));
    fireEvent.click(screen.getByRole("button", { name: "compare-dialog" }));
    fireEvent.click(screen.getByRole("button", { name: "mask-editor" }));
    fireEvent.click(screen.getByRole("button", { name: "toast:完成" }));

    expect(closeCommit).toHaveBeenCalledOnce();
    expect(succeedIdentity).toHaveBeenCalledWith("identity-created");
    expect(closeCompare).toHaveBeenCalledOnce();
    expect(succeedMask).toHaveBeenCalledWith("mask-result.png");
    expect(closeToast).toHaveBeenCalledOnce();
  });
});
