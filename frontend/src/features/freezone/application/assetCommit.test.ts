// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { PushTarget } from "../domain/assetCommit";
import {
  commitFreezoneAsset,
  getFreezoneAssetImpact,
  type FreezoneAssetCommitGateway,
} from "./assetCommit";

const pushResult = {
  target_path: "frames/ep001/beat_02.png",
  target_url: "/static/frames/ep001/beat_02.png",
  backup: null,
};

function createGateway(): FreezoneAssetCommitGateway {
  return {
    commitAsset: vi.fn().mockResolvedValue(pushResult),
    getImpact: vi.fn().mockImplementation(async ({ target }) => ({
      target,
      affected_beats: [],
      affected_count: 0,
    })),
  };
}

function invalidTarget(target: Record<string, unknown>): PushTarget {
  return target as unknown as PushTarget;
}

describe("assetCommit", () => {
  it("delegates valid commits through the application gateway", async () => {
    const gateway = createGateway();
    const params = {
      projectId: "project-a",
      sourceUrl: "/static/generated.png",
      target: { kind: "frame", episode: 1, beat: 2 } as const,
      markStale: false,
    };

    await expect(commitFreezoneAsset(params, gateway)).resolves.toEqual(pushResult);
    expect(gateway.commitAsset).toHaveBeenCalledWith(params);
  });

  it("delegates valid impact queries through the application gateway", async () => {
    const gateway = createGateway();
    const params = {
      projectId: "project-a",
      target: { kind: "scene_master", scene_id: "hall" } as const,
    };

    await expect(getFreezoneAssetImpact(params, gateway)).resolves.toEqual({
      target: params.target,
      affected_beats: [],
      affected_count: 0,
    });
    expect(gateway.getImpact).toHaveBeenCalledWith(params);
  });

  it.each<[
    string,
    PushTarget,
    string,
  ]>([
    [
      "Beat-scoped targets without finite coordinates",
      invalidTarget({ kind: "frame", episode: Number.NaN, beat: 2 }),
      "Beat-scoped asset target requires episode and beat.",
    ],
    [
      "identity targets without complete identity coordinates",
      invalidTarget({ kind: "identity", character: "Alice", identity_id: "" }),
      "Identity asset target requires character and identity_id.",
    ],
    [
      "portrait targets without a character",
      invalidTarget({ kind: "portrait", character: "" }),
      "Portrait asset target requires character.",
    ],
    [
      "scene targets without a scene id",
      invalidTarget({ kind: "scene_master", scene_id: "" }),
      "Scene asset target requires scene_id.",
    ],
    [
      "scene director world file commits",
      { kind: "scene_director_world", scene_id: "hall" },
      "Scene director world commit requires canvas node state.",
    ],
  ])("rejects %s before either gateway method runs", async (_name, target, message) => {
    const gateway = createGateway();

    await expect(commitFreezoneAsset({
      projectId: "project-a",
      sourceUrl: "/static/generated.png",
      target,
    }, gateway)).rejects.toThrow(message);
    await expect(getFreezoneAssetImpact({
      projectId: "project-a",
      target,
    }, gateway)).rejects.toThrow(message);
    expect(gateway.commitAsset).not.toHaveBeenCalled();
    expect(gateway.getImpact).not.toHaveBeenCalled();
  });
});
