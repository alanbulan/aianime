// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { DirectorStageManifest } from "@/features/viewer-kit/three-d/directorManifest";
import type { ThreeDSceneSnapshot } from "@/features/viewer-kit/three-d/engine/viewerApp";
import {
  clearSceneDirectorWorld,
  loadSceneDirectorStageManifest,
  saveSceneDirectorWorld,
  saveSceneDirectorWorldSource,
} from "./scene-director-world";

describe("scene director world operations", () => {
  it("loads and unwraps a scene manifest", async () => {
    const manifest = {} as DirectorStageManifest;
    const getDirectorStageManifest = vi.fn().mockResolvedValue({
      ok: true,
      data: manifest,
    });

    await expect(loadSceneDirectorStageManifest(
      { project: "project-1", sceneId: "scene-1" },
      { getDirectorStageManifest },
    )).resolves.toBe(manifest);
    expect(getDirectorStageManifest).toHaveBeenCalledWith(
      "project-1",
      "scene-1",
    );
  });

  it("saves a complete scene world", async () => {
    const saveDirectorWorld = vi.fn().mockResolvedValue({
      ok: true,
      data: { active_source_id: "front" },
    });
    const payload = {
      active_source_id: "front",
      snapshot: {} as ThreeDSceneSnapshot,
    };

    await expect(saveSceneDirectorWorld(
      { project: "project-1", sceneId: "scene-1", payload },
      { saveDirectorWorld },
    )).resolves.toEqual({ active_source_id: "front" });
    expect(saveDirectorWorld).toHaveBeenCalledWith(
      "project-1",
      "scene-1",
      payload,
    );
  });

  it("saves one source without replacing the scene world", async () => {
    const saveDirectorWorldSource = vi.fn().mockResolvedValue({
      ok: true,
      data: { active_source_id: "reverse" },
    });
    const payload = {
      source_id: "reverse",
      snapshot: {} as ThreeDSceneSnapshot,
    };

    await expect(saveSceneDirectorWorldSource(
      { project: "project-1", sceneId: "scene-1", payload },
      { saveDirectorWorldSource },
    )).resolves.toEqual({ active_source_id: "reverse" });
    expect(saveDirectorWorldSource).toHaveBeenCalledWith(
      "project-1",
      "scene-1",
      payload,
    );
  });

  it("clears one persisted source", async () => {
    const clearDirectorWorld = vi.fn().mockResolvedValue({
      ok: true,
      data: { active_source_id: "" },
    });

    await expect(clearSceneDirectorWorld(
      {
        project: "project-1",
        sceneId: "scene-1",
        activeSourceId: "reverse",
      },
      { clearDirectorWorld },
    )).resolves.toEqual({ active_source_id: "" });
    expect(clearDirectorWorld).toHaveBeenCalledWith(
      "project-1",
      "scene-1",
      "reverse",
    );
  });

  it("raises an unsuccessful gateway response", async () => {
    const getDirectorStageManifest = vi.fn().mockResolvedValue({
      ok: false,
      error: "scene world unavailable",
    });

    await expect(loadSceneDirectorStageManifest(
      { project: "project-1", sceneId: "scene-1" },
      { getDirectorStageManifest },
    )).rejects.toThrow("scene world unavailable");
  });
});
