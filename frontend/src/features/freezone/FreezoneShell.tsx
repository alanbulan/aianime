// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Canvas } from "@/features/canvas/Canvas";
import { NodeReplaceDragPreview } from "@/features/canvas/ui/NodeReplaceDragPreview";
import type { ProjectSummary } from "@/modules/project_workspace/public";
import { currentCanvasParam } from "@/lib/app-router";
import { rememberLastCanvas, writeUrl } from "@/lib/url-params";
import { isCeRuntime } from "@/lib/runtime-config";
import { CommitDialog } from "./commit/CommitDialog";
import {
  defaultCharacterFromMetadata,
  normalizePushTarget,
} from "./commit/canvasCommitRules";
import { CreateIdentityDialog } from "./presentation/CreateIdentityDialog";
import { CompareDialog } from "./presentation/CompareDialog";
import { MaskEditor } from "./presentation/MaskEditor";
import { FreezoneChatDock } from "./presentation/FreezoneChatDock";
import {
  BackupStatusIndicator,
  CanvasConflictOverlay,
  CanvasErrorOverlay,
  CanvasLoadingOverlay,
  CanvasLoadingScreen,
  FreezoneToast,
} from "./presentation/FreezoneCanvasFeedback";
import { AssetLibraryPanel } from "./AssetLibraryPanel";
import { CanvasDebugPanel } from "./CanvasDebugPanel";
import type {
  PushTarget,
  PushTargetKind,
} from "@/features/freezone/domain/assetCommit";
import { useCanvasStore } from "@/features/canvas/canvasStore";
import {
  useCanvasSync,
} from "./hooks/useCanvasSync";
import { prefetchFreezoneImageModels } from "@/features/canvas/hooks/useFreezoneImageModels";
import { prefetchFreezoneVideoModels } from "@/features/canvas/hooks/useFreezoneVideoModels";
import { prefetchFreezoneCameraOptions } from "@/features/canvas/hooks/useFreezoneCameraOptions";
import { prefetchFreezoneStyleTemplates } from "@/features/canvas/hooks/useFreezoneStyleTemplates";
import { prefetchFreezoneVideoCameraTemplates } from "@/features/canvas/hooks/useFreezoneVideoCameraTemplates";
import { useCanvasCommitController } from "./hooks/useCanvasCommitController";
import { useCanvasProjectionCommandController } from "./hooks/useCanvasProjectionCommandController";
import { useCanvasProjectionStatusLifecycle } from "./hooks/useCanvasProjectionStatusLifecycle";

interface FreezoneShellProps {
  project: ProjectSummary;
  canvasId: string;
}

/**
 * Mounts the shared xyflow canvas inside the AI anime Beat Workbench shell.
 * Canvas switching lives inside the left AssetLibraryPanel (主线资产 / 画布 tabs).
 * Commit still lives on eligible canvas nodes. Sync status is
 * intentionally not shown — `useCanvasSync` still loads + persists via
 * /api/v1/projects/<project_id>/freezone/canvases and surfaces conflict /
 * error states via the overlays below; ready/saving states are silent.
 * The outer SPA sidebar already exposes project switching and the task center,
 * so this shell omits the back button, project picker, import/extract/
 * video-ref/3GS triggers, and the top-right Beat Workbench task entry.
 */
const canvasKey = (projectId: string, canvasId: string) => `${projectId}::${canvasId}`;
/** 上一次真正画出来的画布；跨挂载保留，用来判断重进时能否直接复用 store 里的内容。 */
let lastRenderedCanvasKey: string | null = null;

export function FreezoneShell({ project, canvasId }: FreezoneShellProps) {
  const { t } = useTranslation();
  const projectId = project.id;
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
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const showChatDock = !isCeRuntime();
  const handleAssetsChanged = useCallback(() => {
    setAssetLibraryReloadToken((token) => token + 1);
  }, []);
  // 顶栏在「AI anime 画布 / AI anime 工作台」之间切换会整体卸载再挂载本组件，但画布数据留在全局 store 里。
  // 如果这里从 false 起步，回到AI anime 画布就会先把画面换成「正在加载画布…」，等 hydrate 回来
  // 才重新画出来 —— 看着就是卡。同一个画布重进时直接渲染 store 里的既有内容，
  // hydrate 期间只叠一层轻量 overlay。
  const [hasRenderedCanvas, setHasRenderedCanvas] = useState(
    () =>
      lastRenderedCanvasKey === canvasKey(projectId, canvasId) &&
      useCanvasStore.getState().nodes.length > 0,
  );
  const sync = useCanvasSync(projectId, canvasId);

  const handleBlankPaneClick = useCallback(() => {
    setAssetPanelCollapsed(true);
    setDebugPanelOpen(false);
    setChatOpen(false);
  }, []);

  // Warm the shared image-model store the moment we enter a project, so the
  // request is in-flight before any picker / panel mounts.
  useEffect(() => {
    if (!showChatDock) {
      setChatOpen(false);
    }
  }, [showChatDock]);

  useEffect(() => {
    prefetchFreezoneImageModels(projectId);
    prefetchFreezoneVideoModels(projectId);
    prefetchFreezoneCameraOptions(projectId);
    prefetchFreezoneStyleTemplates(projectId);
    prefetchFreezoneVideoCameraTemplates(projectId);
  }, [projectId]);

  useEffect(() => {
    rememberLastCanvas(projectId, canvasId);
    if (canvasId !== "default" && currentCanvasParam() !== canvasId) {
      writeUrl({ canvas: canvasId }, { replace: true, notify: false });
    }
  }, [canvasId, projectId]);

  useEffect(() => {
    if (sync.status === "ready" && sync.hydratedCanvasId === canvasId) {
      lastRenderedCanvasKey = canvasKey(projectId, canvasId);
      setHasRenderedCanvas(true);
    }
  }, [canvasId, projectId, sync.hydratedCanvasId, sync.status]);

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

  const handleMaskEditResult = async (newUrl: string) => {
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
    setToast(`Mask edit 完成 — 新图已入画布`);
    void DEFAULT_NODE_WIDTH; // unused but keep import alive
  };

  const showBlockingLoading = sync.status === "loading" && !hasRenderedCanvas;
  const showLoadingOverlay = sync.status === "loading" && hasRenderedCanvas;

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden">
      <div className="relative flex flex-1 min-h-0">
        <main className="relative h-full min-w-0 flex-1">
          {showBlockingLoading ? (
            <CanvasLoadingScreen />
          ) : (
            <Canvas
              onBlankPaneClick={handleBlankPaneClick}
              controlsPlacement="bottom-right"
            />
          )}
          {showLoadingOverlay && <CanvasLoadingOverlay />}
          {sync.status === "error" && (
            <CanvasErrorOverlay error={sync.error} onRetry={sync.retry} />
          )}
          {sync.status === "conflict" && (
            <CanvasConflictOverlay
              error={sync.error}
              canvasId={canvasId}
              onRefresh={sync.retry}
              onSaveCopy={async () => {
                const copyCanvasId = await sync.saveCopy();
                handleAssetsChanged();
                writeUrl({ canvas: copyCanvasId });
              }}
              readConflictSnapshot={sync.readConflictSnapshot}
            />
          )}
          <BackupStatusIndicator status={sync.backupStatus} />
          {/* 调试面板暂时隐藏，恢复时去掉 `false &&` 即可 */}
          {false && import.meta.env.DEV && (
            <CanvasDebugPanel
              project={projectId}
              canvasId={canvasId}
              open={debugPanelOpen}
              onOpenChange={setDebugPanelOpen}
              placement="top-right"
              status={sync.status}
              backupStatus={sync.backupStatus}
              error={sync.error}
              onRehydrate={sync.retry}
            />
          )}
          <AssetLibraryPanel
            project={projectId}
            metadata={sync.metadata}
            collapsed={assetPanelCollapsed}
            onCollapsedChange={setAssetPanelCollapsed}
            currentCanvasId={canvasId}
            reloadToken={assetLibraryReloadToken}
            onRestoreMainlineDefault={async () => {
              try {
                await sync.restoreMainlineDefault();
                setToast("已按当前主流程事实同步主线视图");
              } catch (err) {
                setToast(err instanceof Error ? err.message : String(err));
              }
            }}
            onReplaced={commitController.handleAssetReplaced}
          />
        </main>
        {showChatDock && (
          <FreezoneChatDock
            open={chatOpen}
            onOpenChange={setChatOpen}
            title={t("freezone.chat.title")}
            description={t("freezone.chat.description")}
            toggleLabel={t("freezone.chat.toggle")}
          />
        )}
      </div>
      <NodeReplaceDragPreview />
      {commitController.prompt && (
        <CommitDialog
          project={projectId}
          sourceUrl={commitController.prompt.sourceUrl}
          previewUrl={commitController.prompt.previewUrl ?? undefined}
          sourceLabelOverride={commitController.prompt.sourceLabel}
          mediaType={commitController.prompt.mediaType}
          defaultTarget={commitController.prompt.defaultTarget}
          directorControlBundle={commitController.prompt.directorControlBundle}
          nodeData={commitController.prompt.nodeData}
          getNodeData={commitController.getPromptNodeData}
          onClose={commitController.closePrompt}
          onSuccess={commitController.handlePromptSuccess}
        />
      )}
      {createIdentitySource && (
        <CreateIdentityDialog
          project={projectId}
          sourceUrl={createIdentitySource.imageUrl}
          previewUrl={createIdentitySource.previewUrl ?? undefined}
          defaultCharacter={presetDefaultCharacter}
          onClose={() => setCreateIdentitySource(null)}
          onSuccess={(msg) => {
            setCreateIdentitySource(null);
            setToast(msg);
          }}
        />
      )}
      {comparePair && (
        <CompareDialog
          left={comparePair.left}
          right={comparePair.right}
          onClose={() => setComparePair(null)}
        />
      )}
      {maskTarget && (
        <MaskEditor
          project={projectId}
          baseUrl={maskTarget.url}
          baseLabel={maskTarget.label}
          onClose={() => setMaskTarget(null)}
          onResult={handleMaskEditResult}
        />
      )}
      {toast && <FreezoneToast text={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

interface SelectedImageSummary {
  nodeId: string;
  imageUrl: string;
  previewUrl: string | null;
  defaultTarget?: Partial<PushTarget> & { kind: PushTargetKind };
  label: string;
}
