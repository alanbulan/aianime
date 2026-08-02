// Copyright (c) 2026 AI anime
export interface SceneAssetsForBeat {
  scene_id: string | null;
  master_url: string | null;
  reverse_url: string | null;
  director_env_only_url: string | null;
  pano_360_url: string | null;
  ply_url: string | null;
}

export type SceneAssetsForBeatResult = SceneAssetsForBeat & {
  project: string;
  episode: number;
  beat: number;
};
