// Copyright (c) 2026 AI anime
import type { SceneAssetsForBeatResult } from "@/features/freezone/public";

export interface GetCanvasSceneAssetsForBeatParams {
  projectId: string;
  episode: number;
  beat: number;
}

export interface CanvasSceneAssetsGateway {
  getForBeat(
    params: GetCanvasSceneAssetsForBeatParams,
  ): Promise<SceneAssetsForBeatResult>;
}

export function getCanvasSceneAssetsForBeat(
  params: GetCanvasSceneAssetsForBeatParams,
  gateway: CanvasSceneAssetsGateway,
): Promise<SceneAssetsForBeatResult> {
  return gateway.getForBeat(params);
}
