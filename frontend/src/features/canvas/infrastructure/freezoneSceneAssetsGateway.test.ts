// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiCall = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/client", () => ({ apiCall }));

import { freezoneSceneAssetsGateway } from "./freezoneSceneAssetsGateway";

beforeEach(() => {
  apiCall.mockReset();
});

describe("freezoneSceneAssetsGateway", () => {
  it("loads scene assets with encoded project and Beat query values", async () => {
    const result = {
      project: "project/one",
      episode: 2,
      beat: 7,
      scene_id: "scene-1",
      master_url: "/master.png",
      reverse_url: null,
      director_env_only_url: null,
      pano_360_url: null,
      ply_url: null,
    };
    apiCall.mockResolvedValue(result);

    await expect(freezoneSceneAssetsGateway.getForBeat({
      projectId: "project/one",
      episode: 2,
      beat: 7,
    })).resolves.toBe(result);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2Fone/freezone/scene-assets-for-beat?episode=2&beat=7",
    );
  });
});
