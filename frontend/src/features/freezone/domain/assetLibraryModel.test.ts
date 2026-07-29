// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import type { DirectorWorldSource } from "@/features/viewer-kit/three-d/directorManifest";

import {
  directorControlBundleFromAssetSource,
  finalizeDirectorWorldAssets,
  SCENE_DIRECTOR_WORLD_ROLE,
  type LibraryAsset,
} from "./assetLibraryModel";

describe("assetLibraryModel", () => {
  it("keeps explicit director bundles and derives legacy combined bundles", () => {
    const explicit = { schema_version: "director_control_bundle_v2" };

    expect(directorControlBundleFromAssetSource({
      director_control_bundle: explicit,
    })).toBe(explicit);
    expect(directorControlBundleFromAssetSource({
      role: "director_combined",
      rel_path: "director_control_frames/ep001/beat_06/combined.png",
      url: "/static/u/p/director_control_frames/ep001/beat_06/combined.png",
    })).toEqual({
      schema_version: "director_control_bundle_v1",
      rel_paths: {
        combined: "director_control_frames/ep001/beat_06/combined.png",
        env_only: "director_control_frames/ep001/beat_06/env_only.png",
        frame_meta: "director_control_frames/ep001/beat_06/frame_meta.json",
      },
      urls: {
        combined: "/static/u/p/director_control_frames/ep001/beat_06/combined.png",
        env_only: "/static/u/p/director_control_frames/ep001/beat_06/env_only.png",
        frame_meta: "/static/u/p/director_control_frames/ep001/beat_06/frame_meta.json",
      },
    });
  });

  it("coalesces scene sources while preserving cover, active source, and scene context", () => {
    const sceneContext = {
      kind: "scene" as const,
      projectId: "project-1",
      sceneId: "scene-1",
      role: "scene_master",
      label: "中庭",
      sourceUrl: "/static/project-1/scenes/scene-1/master.png",
    };
    const assets: LibraryAsset[] = [
      {
        id: "scene-master",
        tab: "scenes",
        kind: "scene",
        role: "scene_master",
        label: "中庭",
        url: "/static/project-1/scenes/scene-1/master.png",
        aspectRatio: "16:9",
        mediaType: "image",
        mainlineContext: [sceneContext],
        source: {
          projectId: "project-1",
          meta: { scene_id: "scene-1", scene: "中庭" },
        },
      },
      {
        id: "world-master",
        tab: "scenes",
        kind: "director",
        role: "scene_3gs_master_ply",
        label: "正面世界",
        url: "/static/project-1/scenes/scene-1/master.sog",
        aspectRatio: "1:1",
        mediaType: "file",
        source: {
          projectId: "project-1",
          meta: { scene_id: "scene-1", scene: "中庭" },
        },
      },
      {
        id: "world-reverse",
        tab: "scenes",
        kind: "director",
        role: "scene_3gs_reverse_ply",
        label: "背面世界",
        url: "/static/project-1/scenes/scene-1/reverse.sog",
        aspectRatio: "1:1",
        mediaType: "file",
        source: {
          projectId: "project-1",
          meta: { scene_id: "scene-1", scene: "中庭", current: true },
        },
      },
      {
        id: "world-pano",
        tab: "scenes",
        kind: "director",
        role: "scene_director_pano_360",
        label: "360世界",
        url: "/static/project-1/scenes/scene-1/pano.png",
        aspectRatio: "2:1",
        mediaType: "image",
        source: {
          projectId: "project-1",
          meta: { scene_id: "scene-1", scene: "中庭" },
        },
      },
    ];

    const finalized = finalizeDirectorWorldAssets(assets);
    const world = finalized.find(
      (asset) => asset.role === SCENE_DIRECTOR_WORLD_ROLE,
    );
    const sources = world?.source.director_world_sources as DirectorWorldSource[];
    const activeSourceId = world?.source.active_source_id as string;

    expect(finalized.map((asset) => asset.role)).toEqual([
      "scene_master",
      SCENE_DIRECTOR_WORLD_ROLE,
    ]);
    expect(world).toMatchObject({
      id: "scene-director-world:scene-1",
      label: "中庭 / 导演世界",
      sublabel: "包含 3 个导演源",
      url: "/static/project-1/scenes/scene-1/reverse.sog",
      coverUrl: "/static/project-1/scenes/scene-1/master.png",
      mainlineContext: [sceneContext],
    });
    expect(sources.map((source) => ({
      sourceKind: source.source_kind,
      sourceType: source.source_type,
    }))).toEqual([
      { sourceKind: "master", sourceType: "sog" },
      { sourceKind: "reverse", sourceType: "sog" },
      { sourceKind: "pano", sourceType: "pano360" },
    ]);
    expect(sources.find((source) => source.id === activeSourceId)).toMatchObject({
      source_kind: "reverse",
      url: "/static/project-1/scenes/scene-1/reverse.sog",
      current: true,
    });
    expect(world?.source.mainline_context).toEqual([sceneContext]);
  });
});
