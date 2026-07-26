// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { DirectorStageManifest } from "@/features/viewer-kit/three-d/directorManifest";

import { loadBeatDirectorStageManifest } from "./load-beat-director-manifest";

describe("loadBeatDirectorStageManifest", () => {
  it("returns the manifest from a successful gateway response", async () => {
    const manifest = {} as DirectorStageManifest;
    const getDirectorStageManifest = vi.fn().mockResolvedValue({
      ok: true,
      data: manifest,
    });

    await expect(loadBeatDirectorStageManifest(
      { project: "project-1", episode: 2, beatNumber: 7 },
      { getDirectorStageManifest },
    )).resolves.toBe(manifest);
    expect(getDirectorStageManifest).toHaveBeenCalledWith(
      "project-1",
      2,
      7,
    );
  });

  it("raises the gateway error when the response is not successful", async () => {
    const getDirectorStageManifest = vi.fn().mockResolvedValue({
      ok: false,
      error: "manifest unavailable",
    });

    await expect(loadBeatDirectorStageManifest(
      { project: "project-1", episode: 2, beatNumber: 7 },
      { getDirectorStageManifest },
    )).rejects.toThrow("manifest unavailable");
  });
});
