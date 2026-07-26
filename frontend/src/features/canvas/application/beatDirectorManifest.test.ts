// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { DirectorStageManifest } from "@/features/viewer-kit/three-d/directorManifest";

import {
  getCanvasBeatDirectorManifest,
  type CanvasBeatDirectorManifestGateway,
} from "./beatDirectorManifest";

describe("getCanvasBeatDirectorManifest", () => {
  it("delegates the complete Beat target to the manifest gateway", async () => {
    const manifest = {
      viewer_kind: "three_d_director",
      mode: "beat",
      project: "project-1",
      episode: 2,
      beat: 7,
      display_name: "Beat 7",
      source: null,
      sources: [],
      active_source_id: null,
      palette: { actors: [], props: [] },
      allowed_destinations: ["view"],
    } as unknown as DirectorStageManifest;
    const getBeatManifest = vi.fn().mockResolvedValue(manifest);
    const gateway: CanvasBeatDirectorManifestGateway = { getBeatManifest };
    const params = { projectId: "project-1", episode: 2, beat: 7 };

    await expect(getCanvasBeatDirectorManifest(params, gateway)).resolves.toBe(manifest);
    expect(getBeatManifest).toHaveBeenCalledWith(params);
  });
});
