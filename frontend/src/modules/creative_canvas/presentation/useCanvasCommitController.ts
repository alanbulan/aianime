// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useState } from "react";

import type { CanvasCommitEventSource } from "../application/canvasCommitEvents";
import {
  latestCanvasNodeData,
  markCommitCandidatePushed,
  nodeDataPatchAfterCommittedTarget,
  refreshCommittedTargetNodes,
  renderCommitSuccessMessage,
  resolveSubmitNodeData,
  sceneDirectorWorldDataForManifest,
  type CanvasCommitStore,
} from "../application/canvasCommitRules";
import type { DirectorRenderCanvasCommitSource } from "../application/directorRenderCommit";
import type { SceneDirectorWorldCommitOptions } from "../application/sceneDirectorWorldCommit";
import type {
  PushResult,
  PushTarget,
  PushTargetKind,
} from "../domain/assetCommit";
import {
  deriveNodeDropInfo,
  modelSourceUrlFromNodeData,
  type CanvasCommitMediaType,
} from "../domain/canvasCommitSource";
import {
  hasDirectorWorldSceneState,
  isDirectorWorldSourceSlotTarget,
  type SceneDirectorWorldTarget,
} from "../domain/directorWorldCommit";
import {
  assetToPushTarget,
  coercePushTarget,
} from "../domain/pushTarget";

type DirectorRenderTarget = Extract<PushTarget, { kind: "director_render" }>;

export interface CanvasCommitPrompt {
  nodeId: string;
  sourceUrl: string;
  previewUrl: string | null;
  sourceLabel: string;
  mediaType: CanvasCommitMediaType;
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

export interface CanvasCommitControllerDependencies {
  store: CanvasCommitStore;
  events: CanvasCommitEventSource;
  cacheBustImage(url: string, token: string | number): string;
  now(): Date;
  saveOpenDirectorWorldScene(nodeId: string): Promise<boolean>;
  commitAsset(
    projectId: string,
    sourceUrl: string,
    target: PushTarget,
    options?: { mark_stale?: boolean },
  ): Promise<PushResult>;
  commitDirectorRender(
    projectId: string,
    target: DirectorRenderTarget,
    source: DirectorRenderCanvasCommitSource,
  ): Promise<PushResult>;
  commitSceneDirectorWorld(
    projectId: string,
    target: SceneDirectorWorldTarget,
    nodeData: Record<string, unknown>,
    options?: SceneDirectorWorldCommitOptions,
  ): Promise<PushResult>;
  useCommittedTargetInvalidator(projectId: string): (target: PushTarget) => void;
}

export function createUseCanvasCommitController(
  dependencies: CanvasCommitControllerDependencies,
) {
  return function useCanvasCommitController({
    projectId,
    flush,
    onAssetsChanged,
    onMessage,
  }: CanvasCommitControllerOptions): CanvasCommitController {
    const [prompt, setPrompt] = useState<CanvasCommitPrompt | null>(null);
    const invalidateCommittedTarget =
      dependencies.useCommittedTargetInvalidator(projectId);

    const applyCommitResult = useCallback((
      nodeId: string,
      target: PushTarget,
      result: PushResult,
    ) => {
      const committedAt = dependencies.now();
      refreshCommittedTargetNodes(
        dependencies.store,
        target,
        result,
        dependencies.cacheBustImage,
        committedAt.getTime(),
      );
      invalidateCommittedTarget(target);
      markCommitCandidatePushed(
        dependencies.store,
        nodeId,
        target,
        result,
        committedAt.toISOString(),
      );
    }, [invalidateCommittedTarget]);

    const handleCommitRequest = useCallback((
      nodeId: string,
      auto: boolean | undefined,
      successMessage: string | undefined,
    ) => {
      const node = dependencies.store.read().nodes.find(
        (candidate) => candidate.id === nodeId,
      );
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
      const sourceMeta = data.__freezone_source as
        | Record<string, unknown>
        | undefined;
      const defaultTarget =
        coercePushTarget(data.slot_target) ??
        coercePushTarget(data.capabilityDefaultPushTarget) ??
        assetToPushTarget(sourceMeta) ??
        undefined;

      if (!auto) {
        void (async () => {
          try {
            const savedOpenScene =
              await dependencies.saveOpenDirectorWorldScene(nodeId);
            if (savedOpenScene) {
              const flushed = await flush();
              if (!flushed) {
                throw new Error("当前画布未保存成功，处理冲突后再提交");
              }
            }
            const latestNode = dependencies.store.read().nodes.find(
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
              typeof latestData.previewImageUrl === "string" &&
              latestData.previewImageUrl
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
          const latestData =
            resolveSubmitNodeData(
              latestCanvasNodeData(dependencies.store, nodeId),
              data,
            ) ?? data;
          const latestSourceUrl =
            info.mediaType === "model"
              ? modelSourceUrlFromNodeData(latestData) ?? sourceUrl
              : sourceUrl;
          const target = defaultTarget as PushTarget;
          const result =
            target.kind === "director_render"
              ? await dependencies.commitDirectorRender(projectId, target, {
                  sourceUrl: latestSourceUrl,
                  previewUrl: preview,
                  bundle: info.directorControlBundle,
                  sourceNodeId: nodeId,
                  label:
                    typeof latestData.displayName === "string"
                      ? latestData.displayName
                      : undefined,
                })
              : target.kind === "scene_director_world"
                ? await dependencies.commitSceneDirectorWorld(
                    projectId,
                    target,
                    latestData,
                  )
                : await dependencies.commitAsset(
                    projectId,
                    latestSourceUrl,
                    target,
                    { mark_stale: false },
                  );
          const nodeDataPatch = nodeDataPatchAfterCommittedTarget(
            latestData,
            target,
            result,
            projectId,
          );
          if (nodeDataPatch) {
            dependencies.store.read().updateNodeData(nodeId, nodeDataPatch);
          }
          const manifestNodeData =
            nodeDataPatch && hasDirectorWorldSceneState(nodeDataPatch)
              ? nodeDataPatch
              : sceneDirectorWorldDataForManifest(
                  latestData,
                  target,
                  result,
                  projectId,
                );
          if (manifestNodeData && isDirectorWorldSourceSlotTarget(target)) {
            await dependencies.commitSceneDirectorWorld(
              projectId,
              { kind: "scene_director_world", scene_id: target.scene_id },
              manifestNodeData,
              { pruneStale: false },
            );
          }
          applyCommitResult(nodeId, target, result);
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
    }, [applyCommitResult, flush, onAssetsChanged, onMessage, projectId]);

    useEffect(() => {
      const unsubscribeCommit = dependencies.events.subscribeCommit(
        ({ nodeId, auto, successMessage }) => {
          handleCommitRequest(nodeId, auto, successMessage);
        },
      );
      const unsubscribeAssets =
        dependencies.events.subscribeAssetsChanged(onAssetsChanged);
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
        latestCanvasNodeData(dependencies.store, prompt.nodeId),
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
        dependencies.store.read().updateNodeData(prompt.nodeId, nodeDataPatch);
      }
      applyCommitResult(prompt.nodeId, target, result);
      onAssetsChanged();
      setPrompt(null);
      onMessage(message);
    }, [applyCommitResult, onAssetsChanged, onMessage, prompt]);

    const handleAssetReplaced = useCallback((
      payload: { target: PushTarget; result: PushResult } | null,
      message: string,
    ) => {
      if (payload) {
        const committedAt = dependencies.now();
        refreshCommittedTargetNodes(
          dependencies.store,
          payload.target,
          payload.result,
          dependencies.cacheBustImage,
          committedAt.getTime(),
        );
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
  };
}
