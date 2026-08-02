// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useState } from "react";

import {
  defaultCharacterFromMetadata,
  normalizePushTarget,
} from "../application/canvasCommitRules";
import type {
  CanvasSyncStatus,
  ConflictSnapshot,
} from "../application/canvasSyncStorage";
import type { PushTarget, PushTargetKind } from "../domain/assetCommit";
import type { CanvasBackupStatus } from "../domain/canvasStorage";
import type {
  CanvasCommitController,
  CanvasCommitControllerOptions,
} from "./useCanvasCommitController";
import type { CanvasProjectionCommandControllerOptions } from "./useCanvasProjectionCommandController";
import type {
  FreezoneCanvasEntryLifecycleOptions,
  FreezoneCanvasEntryState,
} from "./useFreezoneCanvasEntryLifecycle";

export interface FreezoneShellControllerOptions {
  projectId: string;
  canvasId: string;
}

export interface FreezoneShellSyncPort {
  status: CanvasSyncStatus;
  error: string | null;
  metadata: Record<string, unknown> | null;
  revision: number | null;
  hydratedCanvasId: string | null;
  backupStatus: CanvasBackupStatus | null;
  flush(): Promise<boolean>;
  retry(): void;
  saveCopy(): Promise<string>;
  restoreMainlineDefault(options?: { bestEffort?: boolean }): Promise<string>;
  readConflictSnapshot(): ConflictSnapshot | null;
}

export interface FreezoneProjectionStatusLifecycleOptions {
  projectId: string;
  canvasId: string;
  hydratedCanvasId: string | null;
  metadata: Record<string, unknown> | null;
  revision: number | null;
  syncStatus: CanvasSyncStatus;
}

export interface FreezoneShellControllerDependencies {
  useTranslate(): (key: string) => string;
  isChatDockVisible(): boolean;
  useCanvasSync(projectId: string, canvasId: string): FreezoneShellSyncPort;
  useFreezoneCanvasEntryLifecycle(
    options: FreezoneCanvasEntryLifecycleOptions,
  ): FreezoneCanvasEntryState;
  useCanvasProjectionStatusLifecycle(
    options: FreezoneProjectionStatusLifecycleOptions,
  ): void;
  useCanvasCommitController(
    options: CanvasCommitControllerOptions,
  ): CanvasCommitController;
  useCanvasProjectionCommandController(
    options: CanvasProjectionCommandControllerOptions,
  ): void;
  writeCanvasParam(canvasId: string): void;
  addMaskResultNode(url: string, label: string): Promise<void> | void;
}

interface SelectedImageSummary {
  nodeId: string;
  imageUrl: string;
  previewUrl: string | null;
  defaultTarget?: Partial<PushTarget> & { kind: PushTargetKind };
  label: string;
}

export function createUseFreezoneShellController({
  useTranslate,
  isChatDockVisible,
  useCanvasSync,
  useFreezoneCanvasEntryLifecycle,
  useCanvasProjectionStatusLifecycle,
  useCanvasCommitController,
  useCanvasProjectionCommandController,
  writeCanvasParam,
  addMaskResultNode,
}: FreezoneShellControllerDependencies) {
  return function useFreezoneShellController({
    projectId,
    canvasId,
  }: FreezoneShellControllerOptions) {
    const t = useTranslate();
    const [comparePair, setComparePair] = useState<
      | {
          left: { url: string; label: string };
          right: { url: string; label: string };
        }
      | null
    >(null);
    const [createIdentitySource, setCreateIdentitySource] =
      useState<SelectedImageSummary | null>(null);
    const [maskTarget, setMaskTarget] = useState<{
      url: string;
      label: string;
    } | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [assetLibraryReloadToken, setAssetLibraryReloadToken] = useState(0);
    const [assetPanelCollapsed, setAssetPanelCollapsed] = useState(true);
    const [chatOpen, setChatOpen] = useState(false);
    const showChatDock = isChatDockVisible();
    const sync = useCanvasSync(projectId, canvasId);

    const handleAssetsChanged = useCallback(() => {
      setAssetLibraryReloadToken((token) => token + 1);
    }, []);

    const handleBlankPaneClick = useCallback(() => {
      setAssetPanelCollapsed(true);
      setChatOpen(false);
    }, []);

    useEffect(() => {
      if (!showChatDock) {
        setChatOpen(false);
      }
    }, [showChatDock]);

    const { showBlockingLoading, showLoadingOverlay } =
      useFreezoneCanvasEntryLifecycle({
        projectId,
        canvasId,
        hydratedCanvasId: sync.hydratedCanvasId,
        syncStatus: sync.status,
      });

    useCanvasProjectionStatusLifecycle({
      projectId,
      canvasId,
      hydratedCanvasId: sync.hydratedCanvasId,
      metadata: sync.metadata,
      revision: sync.revision,
      syncStatus: sync.status,
    });

    const commitController = useCanvasCommitController({
      projectId,
      flush: sync.flush,
      onAssetsChanged: handleAssetsChanged,
      onMessage: setToast,
    });

    useCanvasProjectionCommandController({
      projectId,
      canvasId,
      metadata: sync.metadata,
      messages: {
        syncMissingRequest: t("freezone.projections.syncMissingRequest"),
        syncSuccess: t("freezone.projections.syncSuccess"),
        removeBlocked: t("freezone.projections.removeBlocked"),
        removeSuccess: t("freezone.projections.removeSuccess"),
      },
      onMessage: setToast,
    });

    const canvasDefaultTarget = normalizePushTarget(
      (sync.metadata?.default_push_target ?? null) as
        | (Partial<PushTarget> & { kind?: PushTargetKind })
        | null,
    );
    const presetDefaultCharacter =
      defaultCharacterFromMetadata(sync.metadata) ??
      (canvasDefaultTarget?.kind === "identity" ||
      canvasDefaultTarget?.kind === "identity_costume" ||
      canvasDefaultTarget?.kind === "identity_portrait" ||
      canvasDefaultTarget?.kind === "portrait"
        ? canvasDefaultTarget.character
        : null);

    const handleSaveConflictCopy = useCallback(async () => {
      const copyCanvasId = await sync.saveCopy();
      handleAssetsChanged();
      writeCanvasParam(copyCanvasId);
    }, [handleAssetsChanged, sync.saveCopy, writeCanvasParam]);

    const handleRestoreMainlineDefault = useCallback(async () => {
      try {
        await sync.restoreMainlineDefault();
        setToast("已按当前主流程事实同步主线视图");
      } catch (error) {
        setToast(error instanceof Error ? error.message : String(error));
      }
    }, [sync.restoreMainlineDefault]);

    const handleMaskEditResult = useCallback(
      async (newUrl: string) => {
        const baseLabel = maskTarget?.label ?? "edit";
        await addMaskResultNode(newUrl, baseLabel);
        setToast("Mask edit 完成 — 新图已入画布");
      },
      [addMaskResultNode, maskTarget?.label],
    );

    return {
      projectId,
      canvasId,
      canvas: {
        showBlockingLoading,
        showLoadingOverlay,
        status: sync.status,
        error: sync.error,
        retry: sync.retry,
        saveConflictCopy: handleSaveConflictCopy,
        readConflictSnapshot: sync.readConflictSnapshot,
        backupStatus: sync.backupStatus,
        onBlankPaneClick: handleBlankPaneClick,
      },
      assetLibrary: {
        metadata: sync.metadata,
        collapsed: assetPanelCollapsed,
        setCollapsed: setAssetPanelCollapsed,
        reloadToken: assetLibraryReloadToken,
        restoreMainlineDefault: handleRestoreMainlineDefault,
        onReplaced: commitController.handleAssetReplaced,
      },
      chat: {
        visible: showChatDock,
        open: chatOpen,
        setOpen: setChatOpen,
        title: t("freezone.chat.title"),
        description: t("freezone.chat.description"),
        toggleLabel: t("freezone.chat.toggle"),
      },
      commitDialog: commitController.prompt
        ? {
            prompt: commitController.prompt,
            getNodeData: commitController.getPromptNodeData,
            close: commitController.closePrompt,
            succeed: commitController.handlePromptSuccess,
          }
        : null,
      createIdentityDialog: createIdentitySource
        ? {
            source: createIdentitySource,
            defaultCharacter: presetDefaultCharacter,
            close: () => setCreateIdentitySource(null),
            succeed: (message: string) => {
              setCreateIdentitySource(null);
              setToast(message);
            },
          }
        : null,
      compareDialog: comparePair
        ? {
            pair: comparePair,
            close: () => setComparePair(null),
          }
        : null,
      maskEditor: maskTarget
        ? {
            target: maskTarget,
            close: () => setMaskTarget(null),
            succeed: handleMaskEditResult,
          }
        : null,
      toast: toast
        ? {
            text: toast,
            close: () => setToast(null),
          }
        : null,
    };
  };
}

export type FreezoneShellController = ReturnType<
  ReturnType<typeof createUseFreezoneShellController>
>;
