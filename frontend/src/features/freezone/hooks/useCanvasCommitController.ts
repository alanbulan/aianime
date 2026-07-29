// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { canvasEventBus } from "@/features/canvas/application/canvasServices";
import { withImageCacheBust } from "@/features/canvas/application/imageData";
import { useCanvasStore } from "@/features/canvas/canvasStore";
import {
  deriveNodeDropInfo,
  modelSourceUrlFromNodeData,
  type DropMediaType,
} from "@/features/canvas/domain/assetDropInfo";
import { saveOpenDirectorWorldScene } from "@/features/canvas/domain/directorWorldSceneSaveRegistry";
import { isCommitCandidateData } from "@/features/canvas/public";
import type {
  PushResult,
  PushTarget,
  PushTargetKind,
} from "@/features/freezone/domain/assetCommit";
import { queryKeys } from "@/lib/query-keys";

import {
  commitDirectorRenderFromCanvasSource,
  commitFreezoneAsset as promoteToAsset,
} from "../composition";
import {
  inferCanonicalRefreshTarget,
  nodeDataPatchAfterCommittedTarget,
  pushTargetsEqual,
  renderCommitSuccessMessage,
  resolveSubmitNodeData,
  sceneDirectorWorldDataForManifest,
  shouldRefreshCommittedTargetNodes,
} from "../commit/canvasCommitRules";
import {
  assetToPushTarget,
  coercePushTarget,
  isPlyOrGlbPushTargetKind,
  isScenePushTargetKind,
} from "../domain/pushTarget";
import {
  commitSceneDirectorWorldFromCanvasNode,
  hasDirectorWorldSceneState,
  isDirectorWorldSourceSlotTarget,
} from "../commit/sceneDirectorWorldCommit";

export interface CanvasCommitPrompt {
  nodeId: string;
  sourceUrl: string;
  previewUrl: string | null;
  sourceLabel: string;
  mediaType: DropMediaType;
  defaultTarget?: Partial<PushTarget> & { kind: PushTargetKind };
  directorControlBundle?: Record<string, unknown> | null;
  nodeData?: Record<string, unknown> | null;
}

export interface CanvasCommitControllerOptions {
  projectId: string;
  flush: () => Promise<boolean>;
  onAssetsChanged: () => void;
  onMessage: (message: string) => void;
}

export interface CanvasCommitController {
  prompt: CanvasCommitPrompt | null;
  closePrompt: () => void;
  getPromptNodeData: () => Record<string, unknown> | null;
  handlePromptSuccess: (
    message: string,
    result: PushResult,
    target: PushTarget,
    nodeDataPatch?: Record<string, unknown> | null,
  ) => void;
  handleAssetReplaced: (
    payload: { target: PushTarget; result: PushResult } | null,
    message: string,
  ) => void;
}

function latestCanvasNodeData(nodeId: string): Record<string, unknown> | null {
  const node = useCanvasStore.getState().nodes.find((candidate) => candidate.id === nodeId);
  return node?.data && typeof node.data === "object"
    ? node.data as Record<string, unknown>
    : null;
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
      coercePushTarget(data.slot_target) ??
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
  const slot = coercePushTarget(data.slot_target);
  if (!slot || !pushTargetsEqual(slot, target)) return;

  const update: Record<string, unknown> = {
    committed_at: new Date().toISOString(),
  };
  if (typeof result.target_url === "string" && result.target_url.length > 0) {
    update.committed_slot_url = result.target_url;
  }
  store.updateNodeData(nodeId, update);
}

export function useCanvasCommitController({
  projectId,
  flush,
  onAssetsChanged,
  onMessage,
}: CanvasCommitControllerOptions): CanvasCommitController {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState<CanvasCommitPrompt | null>(null);

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
      queryClient.invalidateQueries({
        queryKey: queryKeys.scene(projectId, target.scene_id),
      });
    }
  }, [projectId, queryClient]);

  const handleCommitRequest = useCallback((
    nodeId: string,
    auto: boolean | undefined,
    successMessage: string | undefined,
  ) => {
    const node = useCanvasStore.getState().nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      onMessage("当前节点没有可提交的内容");
      return;
    }
    const info = deriveNodeDropInfo(node);
    if (!info?.sourceUrl) {
      onMessage("当前节点没有可提交的内容");
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
      coercePushTarget(data.slot_target) ??
      coercePushTarget(data.capabilityDefaultPushTarget) ??
      assetToPushTarget(sourceMeta) ??
      undefined;

    if (!auto) {
      void (async () => {
        try {
          const savedOpenScene = await saveOpenDirectorWorldScene(nodeId);
          if (savedOpenScene) {
            const flushed = await flush();
            if (!flushed) {
              throw new Error("当前画布未保存成功，处理冲突后再提交");
            }
          }
          const latestNode = useCanvasStore.getState().nodes.find(
            (candidate) => candidate.id === nodeId,
          );
          if (!latestNode) {
            onMessage("当前节点没有可提交的内容");
            return;
          }
          const latestInfo = deriveNodeDropInfo(latestNode);
          if (!latestInfo?.sourceUrl) {
            onMessage("当前节点没有可提交的内容");
            return;
          }
          const latestData = (latestNode.data ?? {}) as Record<string, unknown>;
          const latestPreview =
            typeof latestData.previewImageUrl === "string" && latestData.previewImageUrl
              ? latestData.previewImageUrl
              : latestInfo.mediaType === "image"
                ? latestInfo.sourceUrl
                : null;
          const latestSourceMeta = latestData.__freezone_source as
            | Record<string, unknown>
            | undefined;
          setPrompt({
            nodeId,
            sourceUrl: latestInfo.sourceUrl,
            previewUrl: latestPreview,
            mediaType: latestInfo.mediaType,
            defaultTarget:
              coercePushTarget(latestData.slot_target) ??
              coercePushTarget(latestData.capabilityDefaultPushTarget) ??
              assetToPushTarget(latestSourceMeta) ??
              defaultTarget,
            sourceLabel: latestInfo.label,
            directorControlBundle: latestInfo.directorControlBundle,
            nodeData: latestData,
          });
        } catch (error) {
          onMessage(error instanceof Error ? error.message : String(error));
        }
      })();
      return;
    }

    if (!defaultTarget) {
      onMessage("当前节点没有可自动提交的主线目标");
      return;
    }
    void (async () => {
      onMessage("正在写入当前背景…");
      try {
        const flushed = await flush();
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
              label: typeof latestData.displayName === "string"
                ? latestData.displayName
                : undefined,
            })
          : target.kind === "scene_director_world"
            ? await commitSceneDirectorWorldFromCanvasNode(projectId, target, latestData)
            : await promoteToAsset(projectId, latestSourceUrl, target, {
                mark_stale: false,
              });
        const nodeDataPatch = nodeDataPatchAfterCommittedTarget(
          latestData,
          target,
          result,
          projectId,
        );
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
        onAssetsChanged();
        onMessage(
          successMessage ??
            `${renderCommitSuccessMessage(target, result)}${
              manifestNodeData ? "；已同步导演世界状态" : ""
            }`,
        );
        void flush();
      } catch (error) {
        onMessage(error instanceof Error ? error.message : String(error));
      }
    })();
  }, [
    flush,
    invalidateCommittedTargetQueries,
    onAssetsChanged,
    onMessage,
    projectId,
  ]);

  useEffect(() => {
    const unsubscribeCommit = canvasEventBus.subscribe(
      "freezone/commit-node",
      ({ nodeId, auto, successMessage }) => {
        handleCommitRequest(nodeId, auto, successMessage);
      },
    );
    const unsubscribeAssets = canvasEventBus.subscribe(
      "freezone/assets-updated",
      onAssetsChanged,
    );
    return () => {
      unsubscribeCommit();
      unsubscribeAssets();
    };
  }, [handleCommitRequest, onAssetsChanged]);

  const closePrompt = useCallback(() => {
    setPrompt(null);
  }, []);

  const getPromptNodeData = useCallback(() => {
    if (!prompt) return null;
    return resolveSubmitNodeData(
      latestCanvasNodeData(prompt.nodeId),
      prompt.nodeData,
    );
  }, [prompt]);

  const handlePromptSuccess = useCallback((
    message: string,
    result: PushResult,
    target: PushTarget,
    nodeDataPatch?: Record<string, unknown> | null,
  ) => {
    if (!prompt) return;
    if (nodeDataPatch) {
      useCanvasStore.getState().updateNodeData(prompt.nodeId, nodeDataPatch);
    }
    refreshCommittedTargetNodes(target, result);
    invalidateCommittedTargetQueries(target);
    markCommitCandidatePushed(prompt.nodeId, target, result);
    onAssetsChanged();
    setPrompt(null);
    onMessage(message);
  }, [invalidateCommittedTargetQueries, onAssetsChanged, onMessage, prompt]);

  const handleAssetReplaced = useCallback((
    payload: { target: PushTarget; result: PushResult } | null,
    message: string,
  ) => {
    if (payload) {
      refreshCommittedTargetNodes(payload.target, payload.result);
      onAssetsChanged();
    }
    onMessage(message);
  }, [onAssetsChanged, onMessage]);

  return {
    prompt,
    closePrompt,
    getPromptNodeData,
    handlePromptSuccess,
    handleAssetReplaced,
  };
}
