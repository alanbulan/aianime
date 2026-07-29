// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Canvas } from "@/features/canvas/Canvas";
import { NodeReplaceDragPreview } from "@/features/canvas/ui/NodeReplaceDragPreview";
import type { ProjectSummary } from "@/modules/project_workspace/public";
import { currentCanvasParam } from "@/lib/app-router";
import { rememberLastCanvas, writeUrl } from "@/lib/url-params";
import { isCeRuntime } from "@/lib/runtime-config";
import { CommitDialog } from "./commit/CommitDialog";
import { promoteToAsset } from "./commit/promoteToAsset";
import { commitDirectorRenderFromCanvasSource } from "./commit/directorRenderCommit";
import {
  commitSceneDirectorWorldFromCanvasNode,
  hasDirectorWorldSceneState,
  isDirectorWorldSourceSlotTarget,
} from "./commit/sceneDirectorWorldCommit";
import { nodeDataAfterCommittedSlot } from "./commit/committedNodePatch";
import { isCommitCandidateData } from "./commit/commitEligibility";
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
  PushResult,
  PushTarget,
  PushTargetKind,
} from "@/features/freezone/domain/assetCommit";
import { coerceSlotTarget } from "@/features/canvas/domain/mainlineNodeTypes";
import { canvasEventBus } from "@/features/canvas/application/canvasServices";
import { saveOpenDirectorWorldScene } from "@/features/canvas/domain/directorWorldSceneSaveRegistry";
import {
  assetToPushTarget,
  inferDefaultTarget,
  isPlyOrGlbPushTargetKind,
  isScenePushTargetKind,
} from "@/features/freezone/commit/pushTarget";
import { useCanvasStore } from "@/features/canvas/canvasStore";
import {
  deriveNodeDropInfo,
  modelSourceUrlFromNodeData,
  type DropMediaType,
} from "@/features/canvas/domain/assetDropInfo";
import { withImageCacheBust } from "@/features/canvas/application/imageData";
import { queryKeys } from "@/lib/query-keys";
import {
  useCanvasSync,
} from "./hooks/useCanvasSync";
import { prefetchFreezoneImageModels } from "@/features/canvas/hooks/useFreezoneImageModels";
import { prefetchFreezoneVideoModels } from "@/features/canvas/hooks/useFreezoneVideoModels";
import { prefetchFreezoneCameraOptions } from "@/features/canvas/hooks/useFreezoneCameraOptions";
import { prefetchFreezoneStyleTemplates } from "@/features/canvas/hooks/useFreezoneStyleTemplates";
import { prefetchFreezoneVideoCameraTemplates } from "@/features/canvas/hooks/useFreezoneVideoCameraTemplates";
import { useCanvasProjectionCommandController } from "./hooks/useCanvasProjectionCommandController";
import { useCanvasProjectionStatusLifecycle } from "./hooks/useCanvasProjectionStatusLifecycle";

export { hasLegacyPresetCanvasMetadata } from "@/features/freezone/projections";

interface FreezoneShellProps {
  project: ProjectSummary;
  canvasId: string;
}

function renderCommitSuccessMessage(target: PushTarget, result: PushResult): string {
  if (target.kind === "director_render") {
    return `已提交导演合成资产：${result.target_path}（含纯背景和元数据）`;
  }
  if (target.kind === "scene_director_world") {
    return `已提交导演世界：${result.target_path}`;
  }
  return `已提交到 ${result.target_path}`;
}

function sceneDirectorWorldDataForManifest(
  nodeData: Record<string, unknown>,
  target: PushTarget,
  result: PushResult,
  projectId?: string,
): Record<string, unknown> | null {
  const manifestNodeData = nodeDataPatchAfterCommittedSourceSlot(nodeData, target, result, projectId);
  return hasDirectorWorldSceneState(manifestNodeData) ? manifestNodeData : null;
}

export function nodeDataPatchAfterCommittedSourceSlot(
  nodeData: Record<string, unknown>,
  target: PushTarget,
  result: PushResult,
  projectId?: string,
): Record<string, unknown> | null {
  if (!isDirectorWorldSourceSlotTarget(target)) return null;
  return nodeDataAfterCommittedSlot(nodeData, target, result, projectId);
}

export function nodeDataPatchAfterCommittedTarget(
  nodeData: Record<string, unknown>,
  target: PushTarget,
  result: PushResult,
  projectId?: string,
): Record<string, unknown> | null {
  if (isDirectorWorldSourceSlotTarget(target)) return null;
  return nodeDataAfterCommittedSlot(nodeData, target, result, projectId);
}

function latestCanvasNodeData(nodeId: string): Record<string, unknown> | null {
  const node = useCanvasStore.getState().nodes.find((candidate) => candidate.id === nodeId);
  return node?.data && typeof node.data === "object"
    ? node.data as Record<string, unknown>
    : null;
}

export function resolveSubmitNodeData(
  latest: Record<string, unknown> | null | undefined,
  fallback: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  return latest ?? fallback ?? null;
}

export function shouldRefreshCommittedTargetNodes(target: PushTarget): boolean {
  // scene_director_world is a structured manifest/state commit, not a media file
  // replacement. Refreshing canvas node URLs with its result corrupts the visual
  // node into a broken image/manifest preview.
  return target.kind !== "scene_director_world";
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
  const queryClient = useQueryClient();
  const projectId = project.id;
  const [pushState, setPushState] = useState<PushPrompt | null>(null);
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
  // 顶栏在「AI anime 画布 / AI anime 工作台」之间切换会整体卸载再挂载本组件，但画布数据留在全局 store 里。
  // 如果这里从 false 起步，回到AI anime 画布就会先把画面换成「正在加载画布…」，等 hydrate 回来
  // 才重新画出来 —— 看着就是卡。同一个画布重进时直接渲染 store 里的既有内容，
  // hydrate 期间只叠一层轻量 overlay。
  const [hasRenderedCanvas, setHasRenderedCanvas] = useState(
    () =>
      lastRenderedCanvasKey === canvasKey(projectId, canvasId) &&
      useCanvasStore.getState().nodes.length > 0,
  );
  const invalidateCommittedTargetQueries = useCallback((target: PushTarget) => {
    if (isDirectorWorldSourceSlotTarget(target) || target.kind === "scene_director_world") {
      queryClient.invalidateQueries({
        queryKey: queryKeys.sceneDirectorStageManifest(projectId, target.scene_id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.scenes(projectId) });
      return;
    }
    if (isScenePushTargetKind(target.kind) && "scene_id" in target) {
      queryClient.invalidateQueries({ queryKey: queryKeys.scenes(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.scene(projectId, target.scene_id) });
    }
  }, [projectId, queryClient]);
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

  // 节点 toolbar 上的 Commit 按钮通过 canvasEventBus 触发；这里订阅、查节点、
  // 推 CommitDialog。比 AssetLibraryPanel 的 Commit 宽松：任何带 imageUrl 的
  // 节点都允许提交，slot_target 只是给 dialog 一个 default，缺失也能让用户手选目标。
  useEffect(() => {
    return canvasEventBus.subscribe("freezone/commit-node", ({ nodeId, auto, successMessage }) => {
      const node = useCanvasStore.getState().nodes.find((n) => n.id === nodeId);
      if (!node) {
        setToast("当前节点没有可提交的内容");
        return;
      }
      // 泛化:不再只认 imageUrl,而是按节点类型推断媒体 url(图像/视频/音频/3GS)。
      const info = deriveNodeDropInfo(node);
      if (!info?.sourceUrl) {
        setToast("当前节点没有可提交的内容");
        return;
      }
      const sourceUrl = info.sourceUrl;
      const data = (node.data ?? {}) as Record<string, unknown>;
      const preview =
        typeof data.previewImageUrl === "string" && data.previewImageUrl
          ? data.previewImageUrl
          : info.mediaType === "image"
            ? sourceUrl
            : null;
      const sourceMeta = data.__freezone_source as Record<string, unknown> | undefined;
      const defaultTarget =
        coerceSlotTarget(data.slot_target) ??
        coerceSlotTarget(data.capabilityDefaultPushTarget) ??
        assetToPushTarget(sourceMeta) ??
        undefined;
      if (!auto) {
        void (async () => {
          try {
            const savedOpenScene = await saveOpenDirectorWorldScene(nodeId);
            if (savedOpenScene) {
              const flushed = await sync.flush();
              if (!flushed) {
                throw new Error("当前画布未保存成功，处理冲突后再提交");
              }
            }
            const latestNode = useCanvasStore.getState().nodes.find((candidate) => candidate.id === nodeId);
            if (!latestNode) {
              setToast("当前节点没有可提交的内容");
              return;
            }
            const latestInfo = deriveNodeDropInfo(latestNode);
            if (!latestInfo?.sourceUrl) {
              setToast("当前节点没有可提交的内容");
              return;
            }
            const latestData = (latestNode.data ?? {}) as Record<string, unknown>;
            const latestPreview =
              typeof latestData.previewImageUrl === "string" && latestData.previewImageUrl
                ? latestData.previewImageUrl
                : latestInfo.mediaType === "image"
                  ? latestInfo.sourceUrl
                  : null;
            const latestSourceMeta = latestData.__freezone_source as Record<string, unknown> | undefined;
            setPushState({
              nodeId,
              sourceUrl: latestInfo.sourceUrl,
              previewUrl: latestPreview,
              mediaType: latestInfo.mediaType,
              defaultTarget:
                coerceSlotTarget(latestData.slot_target) ??
                coerceSlotTarget(latestData.capabilityDefaultPushTarget) ??
                assetToPushTarget(latestSourceMeta) ??
                defaultTarget,
              sourceLabel: latestInfo.label,
              directorControlBundle: latestInfo.directorControlBundle,
              nodeData: latestData,
            });
          } catch (err) {
            setToast(err instanceof Error ? err.message : String(err));
          }
        })();
        return;
      }
      if (!defaultTarget) {
        setToast("当前节点没有可自动提交的主线目标");
        return;
      }
      void (async () => {
        setToast("正在写入当前背景…");
        try {
          const flushed = await sync.flush();
          if (!flushed) {
            throw new Error("当前画布未保存成功，处理冲突后再提交");
          }
          const latestData = resolveSubmitNodeData(latestCanvasNodeData(nodeId), data) ?? data;
          const latestSourceUrl =
            info.mediaType === "model"
              ? modelSourceUrlFromNodeData(latestData) ?? sourceUrl
              : sourceUrl;
          const target = defaultTarget as PushTarget;
          const result = target.kind === "director_render"
            ? await commitDirectorRenderFromCanvasSource(projectId, target, {
                sourceUrl: latestSourceUrl,
                previewUrl: preview,
                bundle: info.directorControlBundle,
                sourceNodeId: nodeId,
                label: typeof latestData.displayName === "string" ? latestData.displayName : undefined,
              })
            : target.kind === "scene_director_world"
              ? await commitSceneDirectorWorldFromCanvasNode(projectId, target, latestData)
              : await promoteToAsset(projectId, latestSourceUrl, target, {
                mark_stale: false,
              });
          const nodeDataPatch = nodeDataPatchAfterCommittedTarget(latestData, target, result, projectId);
          if (nodeDataPatch) {
            useCanvasStore.getState().updateNodeData(nodeId, nodeDataPatch);
          }
          const manifestNodeData = nodeDataPatch && hasDirectorWorldSceneState(nodeDataPatch)
            ? nodeDataPatch
            : sceneDirectorWorldDataForManifest(latestData, target, result, projectId);
          if (manifestNodeData && isDirectorWorldSourceSlotTarget(target)) {
            await commitSceneDirectorWorldFromCanvasNode(projectId, {
              kind: "scene_director_world",
              scene_id: target.scene_id,
            }, manifestNodeData, { pruneStale: false });
          }
          refreshCommittedTargetNodes(target, result);
          invalidateCommittedTargetQueries(target);
          markCommitCandidatePushed(nodeId, target, result);
          setAssetLibraryReloadToken((token) => token + 1);
          setToast(
            successMessage ??
              `${renderCommitSuccessMessage(target, result)}${
                manifestNodeData ? "；已同步导演世界状态" : ""
              }`,
          );
          void sync.flush();
        } catch (err) {
          setToast(err instanceof Error ? err.message : String(err));
        }
      })();
    });
  }, [projectId, sync]);

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

  useEffect(() => {
    return canvasEventBus.subscribe("freezone/assets-updated", () => {
      setAssetLibraryReloadToken((token) => token + 1);
    });
  }, []);

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
                setAssetLibraryReloadToken((token) => token + 1);
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
            onReplaced={(payload, message) => {
              if (payload) {
                refreshCommittedTargetNodes(payload.target, payload.result);
                setAssetLibraryReloadToken((token) => token + 1);
              }
              setToast(message);
            }}
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
      {pushState && (
        <CommitDialog
          project={projectId}
          sourceUrl={pushState.sourceUrl}
          previewUrl={pushState.previewUrl ?? undefined}
          sourceLabelOverride={pushState.sourceLabel}
          mediaType={pushState.mediaType}
          defaultTarget={pushState.defaultTarget}
          directorControlBundle={pushState.directorControlBundle}
          nodeData={pushState.nodeData}
          getNodeData={() => resolveSubmitNodeData(latestCanvasNodeData(pushState.nodeId), pushState.nodeData)}
          onClose={() => setPushState(null)}
          onSuccess={(msg, result, target, nodeDataPatch) => {
            if (nodeDataPatch) {
              useCanvasStore.getState().updateNodeData(pushState.nodeId, nodeDataPatch);
            }
            refreshCommittedTargetNodes(target, result);
            invalidateCommittedTargetQueries(target);
            markCommitCandidatePushed(pushState.nodeId, target, result);
            setAssetLibraryReloadToken((token) => token + 1);
            setPushState(null);
            setToast(msg);
          }}
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

function normalizePushTarget(
  target: (Partial<PushTarget> & { kind?: PushTargetKind }) | null,
): (Partial<PushTarget> & { kind: PushTargetKind }) | null {
  if (!target?.kind) return null;
  return target as Partial<PushTarget> & { kind: PushTargetKind };
}

function refreshCommittedTargetNodes(
  target: PushTarget,
  result: PushResult,
): void {
  if (!shouldRefreshCommittedTargetNodes(target)) return;
  const targetUrl = result.target_url;
  if (!targetUrl) return;
  const previewUrl = withImageCacheBust(targetUrl, Date.now());

  const store = useCanvasStore.getState();
  for (const node of store.nodes) {
    const data = (node.data ?? {}) as Record<string, unknown>;
    if (data.user_spawned === true) continue;
    const sourceMeta = data.__freezone_source as
      | { kind?: string; role?: string; meta?: Record<string, unknown> }
      | undefined;
    const nodeTarget =
      coerceSlotTarget(data.slot_target) ??
      inferCanonicalRefreshTarget(sourceMeta);
    if (!nodeTarget || !pushTargetsEqual(nodeTarget, target)) continue;

    const baseUpdate =
      target.kind === "video"
        ? { videoUrl: targetUrl, previewImageUrl: previewUrl }
        : target.kind === "beat_audio"
          ? { audioUrl: targetUrl, url: targetUrl }
          : isPlyOrGlbPushTargetKind(target.kind)
            ? { fileUrl: targetUrl, modelUrl: targetUrl, plyUrl: targetUrl, url: targetUrl }
            : { imageUrl: targetUrl, previewImageUrl: previewUrl };
    store.updateNodeData(node.id, {
      ...baseUpdate,
      committed_slot_url: targetUrl,
    } as Record<string, unknown>);
  }
}

function markCommitCandidatePushed(
  nodeId: string,
  target: PushTarget,
  result: PushResult,
): void {
  const store = useCanvasStore.getState();
  const node = store.nodes.find((candidate) => candidate.id === nodeId);
  const data = (node?.data ?? {}) as Record<string, unknown>;
  if (!isCommitCandidateData(data)) return;
  const slot = coerceSlotTarget(data.slot_target);
  if (!slot || !pushTargetsEqual(slot, target)) return;

  const update: Record<string, unknown> = {
    committed_at: new Date().toISOString(),
  };
  if (typeof result.target_url === "string" && result.target_url.length > 0) {
    update.committed_slot_url = result.target_url;
  }
  store.updateNodeData(nodeId, update);
}

function inferCanonicalRefreshTarget(
  source:
    | { kind?: string; role?: string; meta?: Record<string, unknown> }
    | undefined,
): (Partial<PushTarget> & { kind: PushTargetKind }) | undefined {
  if (!source?.kind) return undefined;
  return inferDefaultTarget(source);
}

function pushTargetsEqual(
  a: Partial<PushTarget> & { kind: PushTargetKind },
  b: PushTarget,
): boolean {
  if (a.kind !== b.kind) return false;
  const av = a as Record<string, unknown>;
  if (
    b.kind === "frame" ||
    b.kind === "sketch" ||
    b.kind === "director_render" ||
    b.kind === "selected_background" ||
    b.kind === "video" ||
    b.kind === "beat_audio"
  ) {
    return av.episode === b.episode && av.beat === b.beat;
  }
  if (
    b.kind === "identity" ||
    b.kind === "identity_costume" ||
    b.kind === "identity_portrait"
  ) {
    return av.character === b.character && av.identity_id === b.identity_id;
  }
  if (b.kind === "portrait") {
    return av.character === b.character;
  }
  if (isScenePushTargetKind(b.kind)) {
    return av.scene_id === (b as unknown as Record<string, unknown>).scene_id;
  }
  if (b.kind === "prop_ref") {
    return av.prop_id === b.prop_id;
  }
  return false;
}

function defaultCharacterFromMetadata(metadata: Record<string, unknown> | null): string | null {
  const preset = metadata?.preset as { character?: unknown } | undefined;
  return typeof preset?.character === "string" && preset.character ? preset.character : null;
}

interface PushPrompt {
  nodeId: string;
  sourceUrl: string;
  previewUrl: string | null;
  sourceLabel: string;
  mediaType: DropMediaType;
  defaultTarget?: Partial<PushTarget> & { kind: PushTargetKind };
  directorControlBundle?: Record<string, unknown> | null;
  nodeData?: Record<string, unknown> | null;
}

interface SelectedImageSummary {
  nodeId: string;
  imageUrl: string;
  previewUrl: string | null;
  defaultTarget?: Partial<PushTarget> & { kind: PushTargetKind };
  label: string;
}
