// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useCanvasStore,
  type CanvasNodeData,
} from "@/features/canvas/canvasStore";
import { withImageCacheBust } from "@/features/canvas/public";
import {
  createCanvasCommitControllerHook,
  defaultCharacterFromMetadata,
  normalizePushTarget,
  useCanvasProjectionCommandController,
  useCanvasProjectionStatusLifecycle,
  type PushTarget,
  type PushTargetKind,
} from "@/modules/creative_canvas/public";
import { isCeRuntime } from "@/lib/runtime-config";
import { writeUrl } from "@/lib/url-params";

import { useCanvasSync } from "./useCanvasSync";
import { useFreezoneCanvasEntryLifecycle } from "./useFreezoneCanvasEntryLifecycle";

const useCanvasCommitController = createCanvasCommitControllerHook({
  store: {
    read() {
      const state = useCanvasStore.getState();
      return {
        nodes: state.nodes,
        updateNodeData: (nodeId, patch) => {
          state.updateNodeData(nodeId, patch as Partial<CanvasNodeData>);
        },
      };
    },
  },
  cacheBustImage: withImageCacheBust,
});

export interface FreezoneShellControllerOptions {
  projectId: string;
  canvasId: string;
}

interface SelectedImageSummary {
  nodeId: string;
  imageUrl: string;
  previewUrl: string | null;
  defaultTarget?: Partial<PushTarget> & { kind: PushTargetKind };
  label: string;
}

export function useFreezoneShellController({
  projectId,
  canvasId,
}: FreezoneShellControllerOptions) {
  const { t } = useTranslation();
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
  const showChatDock = !isCeRuntime();
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

  const {
    showBlockingLoading,
    showLoadingOverlay,
  } = useFreezoneCanvasEntryLifecycle({
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
    (
      canvasDefaultTarget?.kind === "identity" ||
      canvasDefaultTarget?.kind === "identity_costume" ||
      canvasDefaultTarget?.kind === "identity_portrait" ||
      canvasDefaultTarget?.kind === "portrait"
        ? canvasDefaultTarget.character
        : null
    );

  const handleSaveConflictCopy = useCallback(async () => {
    const copyCanvasId = await sync.saveCopy();
    handleAssetsChanged();
    writeUrl({ canvas: copyCanvasId });
  }, [handleAssetsChanged, sync.saveCopy]);

  const handleRestoreMainlineDefault = useCallback(async () => {
    try {
      await sync.restoreMainlineDefault();
      setToast("已按当前主流程事实同步主线视图");
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error));
    }
  }, [sync.restoreMainlineDefault]);

  const handleMaskEditResult = useCallback(async (newUrl: string) => {
    const { CANVAS_NODE_TYPES, DEFAULT_NODE_WIDTH } = await import(
      "@/features/canvas/domain/canvasNodes"
    );
    const addNode = useCanvasStore.getState().addNode;
    const baseLabel = maskTarget?.label ?? "edit";
    addNode(
      CANVAS_NODE_TYPES.upload,
      { x: 100, y: 1100 },
      {
        displayName: `${baseLabel} (mask)`,
        imageUrl: newUrl,
        previewImageUrl: newUrl,
        aspectRatio: "1:1",
        sourceFileName: `${baseLabel}-mask`,
      } as Record<string, unknown>,
    );
    setToast("Mask edit 完成 — 新图已入画布");
    void DEFAULT_NODE_WIDTH;
  }, [maskTarget?.label]);

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
}

export type FreezoneShellController = ReturnType<
  typeof useFreezoneShellController
>;
