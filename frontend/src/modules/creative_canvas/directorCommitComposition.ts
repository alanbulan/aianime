// Copyright (c) 2026 AI anime
import {
  commitDirectorRenderFromCanvasSource as commitDirectorRenderFromCanvasSourceUseCase,
  type DirectorRenderCanvasCommitSource,
  type DirectorRenderTarget,
} from "./application/directorRenderCommit";
import {
  commitSceneDirectorWorldFromCanvasNode as commitSceneDirectorWorldFromCanvasNodeUseCase,
  type SceneDirectorWorldCommitOptions,
} from "./application/sceneDirectorWorldCommit";
import type { SceneDirectorWorldTarget } from "./domain/directorWorldCommit";
import { assetWorldSceneDirectorCommitGateway } from "./infrastructure/assetWorldSceneDirectorCommitGateway";
import { browserDirectorRenderCommitGateway } from "./infrastructure/browserDirectorRenderCommitGateway";

export function commitDirectorRenderFromCanvasSource(
  projectId: string,
  target: DirectorRenderTarget,
  source: DirectorRenderCanvasCommitSource,
) {
  return commitDirectorRenderFromCanvasSourceUseCase(
    { projectId, target, source },
    browserDirectorRenderCommitGateway,
  );
}

export function commitSceneDirectorWorldFromCanvasNode(
  project: string,
  target: SceneDirectorWorldTarget,
  nodeData: Record<string, unknown>,
  options?: SceneDirectorWorldCommitOptions,
) {
  return commitSceneDirectorWorldFromCanvasNodeUseCase(
    { project, target, nodeData, options },
    assetWorldSceneDirectorCommitGateway,
  );
}
