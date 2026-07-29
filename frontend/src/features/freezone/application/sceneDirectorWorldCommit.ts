// Copyright (c) 2026 AI anime
import type { PushResult } from "../domain/assetCommit";
import {
  buildSceneDirectorWorldCommitPlan,
  type DirectorWorldSceneSnapshot,
  type SceneDirectorWorldTarget,
} from "../domain/directorWorldCommit";

export interface SceneDirectorWorldCommitOptions {
  pruneStale?: boolean;
}

export interface CommitSceneDirectorWorldParams {
  project: string;
  target: SceneDirectorWorldTarget;
  nodeData: Record<string, unknown>;
  options?: SceneDirectorWorldCommitOptions;
}

export interface PersistSceneDirectorWorldSourceParams {
  project: string;
  sceneId: string;
  sourceId: string;
  snapshot: DirectorWorldSceneSnapshot;
  source?: Record<string, unknown>;
}

export interface SceneDirectorWorldCommitGateway {
  loadSourceIds(project: string, sceneId: string): Promise<ReadonlySet<string>>;
  saveWorld(params: PersistSceneDirectorWorldSourceParams): Promise<void>;
  saveSource(params: PersistSceneDirectorWorldSourceParams): Promise<void>;
  clearSource(project: string, sceneId: string, sourceId: string): Promise<void>;
}

export async function commitSceneDirectorWorldFromCanvasNode(
  params: CommitSceneDirectorWorldParams,
  gateway: SceneDirectorWorldCommitGateway,
): Promise<PushResult> {
  const plan = buildSceneDirectorWorldCommitPlan(params.target, params.nodeData);
  const pruneStale = params.options?.pruneStale ?? true;

  for (const entry of plan.entries) {
    const persistence = {
      project: params.project,
      sceneId: plan.sceneId,
      ...entry,
    };
    if (pruneStale) {
      await gateway.saveWorld(persistence);
    } else {
      await gateway.saveSource(persistence);
    }
  }

  if (pruneStale) {
    let existingSourceIds: ReadonlySet<string> = new Set();
    try {
      existingSourceIds = await gateway.loadSourceIds(
        params.project,
        plan.sceneId,
      );
    } catch {
      existingSourceIds = new Set();
    }
    const nextSourceIds = new Set(plan.entries.map((entry) => entry.sourceId));
    for (const sourceId of existingSourceIds) {
      if (!nextSourceIds.has(sourceId)) {
        await gateway.clearSource(params.project, plan.sceneId, sourceId);
      }
    }
  }

  return plan.result;
}
