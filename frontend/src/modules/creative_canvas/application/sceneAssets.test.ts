// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  getCanvasSceneAssetsForBeat,
  type CanvasSceneAssetsGateway,
} from "./sceneAssets";

describe("getCanvasSceneAssetsForBeat", () => {
  it("delegates the complete Beat target to the scene-assets gateway", async () => {
    const result = {
      project: "project-1",
      episode: 2,
      beat: 7,
      scene_id: "scene-1",
      master_url: "/master.png",
      reverse_url: null,
      director_env_only_url: null,
      pano_360_url: null,
      ply_url: null,
    };
    const getForBeat = vi.fn().mockResolvedValue(result);
    const gateway: CanvasSceneAssetsGateway = { getForBeat };
    const params = { projectId: "project-1", episode: 2, beat: 7 };

    await expect(getCanvasSceneAssetsForBeat(params, gateway)).resolves.toBe(result);
    expect(getForBeat).toHaveBeenCalledWith(params);
  });
});
