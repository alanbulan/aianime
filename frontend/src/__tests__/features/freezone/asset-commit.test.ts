// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from "vitest";

const apiCall = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/client", () => ({ apiCall }));

import {
  commitFreezoneAsset,
  getFreezoneAssetImpact,
  type FreezoneAssetCommitGateway,
} from "@/features/freezone/application/assetCommit";
import { httpFreezoneAssetCommitGateway } from "@/features/freezone/infrastructure/httpFreezoneAssetCommitGateway";
import type {
  ImpactResult,
  PushResult,
  PushTarget,
} from "@/features/freezone/public";

const target = {
  kind: "frame",
  episode: 1,
  beat: 2,
} satisfies PushTarget;

const pushResult = {
  target_path: "episodes/1/beats/2/frame.png",
  target_url: "/static/projects/demo/episodes/1/beats/2/frame.png",
  backup: null,
  stale_marked: 1,
  affected_count: 1,
} satisfies PushResult;

const impactResult = {
  target,
  affected_beats: [{ episode: 1, beat: 2, visual_description: "rainy street" }],
  affected_count: 1,
} satisfies ImpactResult;

afterEach(() => {
  apiCall.mockReset();
});

describe("Freezone asset commit application", () => {
  it("delegates commit and impact queries through the injected gateway", async () => {
    const commitAsset = vi.fn().mockResolvedValue(pushResult);
    const getImpact = vi.fn().mockResolvedValue(impactResult);
    const gateway: FreezoneAssetCommitGateway = { commitAsset, getImpact };
    const commitParams = {
      projectId: "demo",
      sourceUrl: "/outputs/frame.png",
      target,
      markStale: true,
    };
    const impactParams = { projectId: "demo", target };

    await expect(commitFreezoneAsset(commitParams, gateway)).resolves.toBe(
      pushResult,
    );
    await expect(
      getFreezoneAssetImpact(impactParams, gateway),
    ).resolves.toBe(impactResult);
    expect(commitAsset).toHaveBeenCalledWith(commitParams);
    expect(getImpact).toHaveBeenCalledWith(impactParams);
  });
});

describe("HTTP Freezone asset commit gateway", () => {
  it("maps commit parameters to the canonical push endpoint", async () => {
    apiCall.mockResolvedValueOnce(pushResult);

    await expect(
      httpFreezoneAssetCommitGateway.commitAsset({
        projectId: "demo project",
        sourceUrl: "/outputs/frame.png",
        target,
        markStale: true,
      }),
    ).resolves.toBe(pushResult);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/demo%20project/freezone/push",
      {
        method: "POST",
        json: {
          source_url: "/outputs/frame.png",
          target,
          mark_stale: true,
        },
      },
    );
  });

  it("maps impact queries to the canonical impact endpoint", async () => {
    apiCall.mockResolvedValueOnce(impactResult);

    await expect(
      httpFreezoneAssetCommitGateway.getImpact({
        projectId: "demo project",
        target,
      }),
    ).resolves.toBe(impactResult);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/demo%20project/freezone/impact",
      { method: "POST", json: { target } },
    );
  });
});
