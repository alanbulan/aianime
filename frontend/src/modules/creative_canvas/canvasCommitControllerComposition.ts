// Copyright (c) 2026 AI anime
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { canvasCommitEvents } from "./application/canvasCommitEvents";
import type { CanvasCommitStore } from "./application/canvasCommitRules";
import { saveOpenDirectorWorldScene } from "./application/directorWorldSceneSaveRegistry";
import { commitFreezoneAsset } from "./assetTransferComposition";
import { commitDirectorRenderFromCanvasSource, commitSceneDirectorWorldFromCanvasNode } from "./directorCommitComposition";
import {
  isDirectorWorldSourceSlotTarget,
} from "./domain/directorWorldCommit";
import { isScenePushTargetKind } from "./domain/pushTarget";
import {
  createUseCanvasCommitController,
} from "./presentation/useCanvasCommitController";
import type { PushTarget } from "./domain/assetCommit";
import { queryKeys } from "@/lib/query-keys";

export interface CanvasCommitControllerCompositionOptions {
  store: CanvasCommitStore;
  cacheBustImage(url: string, token: string | number): string;
}

function useCommittedTargetInvalidator(projectId: string) {
  const queryClient = useQueryClient();
  return useCallback((target: PushTarget) => {
    if (
      isDirectorWorldSourceSlotTarget(target) ||
      target.kind === "scene_director_world"
    ) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.sceneDirectorStageManifest(
          projectId,
          target.scene_id,
        ),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.scenes(projectId) });
      return;
    }
    if (isScenePushTargetKind(target.kind) && "scene_id" in target) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scenes(projectId) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.scene(projectId, target.scene_id),
      });
    }
  }, [projectId, queryClient]);
}

export function createCanvasCommitControllerHook({
  store,
  cacheBustImage,
}: CanvasCommitControllerCompositionOptions) {
  return createUseCanvasCommitController({
    store,
    events: canvasCommitEvents,
    cacheBustImage,
    now: () => new Date(),
    saveOpenDirectorWorldScene,
    commitAsset: commitFreezoneAsset,
    commitDirectorRender: commitDirectorRenderFromCanvasSource,
    commitSceneDirectorWorld: commitSceneDirectorWorldFromCanvasNode,
    useCommittedTargetInvalidator,
  });
}
