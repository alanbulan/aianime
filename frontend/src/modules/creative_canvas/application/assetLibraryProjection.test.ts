// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import type {
  FreezoneBeatContextResponse,
  FreezoneProjectAsset,
} from "../domain/beatContext";
import { buildLibraryAssets } from "./assetLibraryProjection";

function projectAsset(
  overrides: Partial<FreezoneProjectAsset>,
): FreezoneProjectAsset {
  return {
    id: "asset-1",
    tab: "beat",
    kind: "frame",
    role: "current_frame",
    label: "当前成图",
    url: "/static/project-1/frame.png",
    media_type: "image",
    exists: true,
    ...overrides,
  };
}

describe("assetLibraryProjection", () => {
  it("keeps repeated beat outputs distinct and projects their beat context", () => {
    const sharedFrame = projectAsset({
      id: "shared-frame",
      url: "/static/project-1/shared-frame.png",
    });
    const beatContext: FreezoneBeatContextResponse = {
      scope: { episode: null, beat: null },
      episodes: [{
        episode: 1,
        beats: [
          {
            episode: 1,
            beat: 1,
            label: "Beat 1",
            scene_id: "scene-a",
            assets: [sharedFrame],
          },
          {
            episode: 1,
            beat: 2,
            label: "Beat 2",
            scene_id: "scene-b",
            assets: [sharedFrame],
          },
        ],
      }],
      assets: [],
    };

    const assets = buildLibraryAssets({
      project: "project-1",
      metadata: null,
      projectAssets: [],
      beatContext,
      canvasKind: "default",
    });

    expect(assets).toHaveLength(2);
    expect(assets.map((asset) => ({
      label: asset.label,
      tab: asset.tab,
      fromBeatContext: asset.source.from_beat_context,
      beatContext: asset.beatContext,
    }))).toEqual([
      {
        label: "当前分镜",
        tab: "beat",
        fromBeatContext: true,
        beatContext: expect.objectContaining({
          kind: "beat",
          projectId: "project-1",
          episode: 1,
          beat: 1,
          sceneId: "scene-a",
        }),
      },
      {
        label: "当前分镜",
        tab: "beat",
        fromBeatContext: true,
        beatContext: expect.objectContaining({
          kind: "beat",
          projectId: "project-1",
          episode: 1,
          beat: 2,
          sceneId: "scene-b",
        }),
      },
    ]);
  });

  it("filters unusable pointers and normalizes surviving project assets", () => {
    const assets = buildLibraryAssets({
      project: "project-1",
      metadata: null,
      beatContext: null,
      canvasKind: "default",
      projectAssets: [
        projectAsset({ id: "missing-url", url: null }),
        projectAsset({ id: "missing-file", exists: false }),
        projectAsset({
          id: "freezone-temp",
          rel_path: "freezone/uploads/temp.png",
        }),
        projectAsset({ id: "scene-360", tab: "scenes", role: "scene_360" }),
        projectAsset({
          id: "scene-active",
          tab: "director",
          kind: "director",
          role: "scene_3gs_active_ply",
        }),
        projectAsset({
          id: "director-combined",
          tab: "director",
          kind: "director",
          role: "director_combined",
          label: "导演合成图",
          rel_path: "freezone/director_control_frames/ep001/beat_03/combined.png",
          url: "/static/project-1/director_control_frames/ep001/beat_03/combined.png",
          slot_target: { kind: "director_render", episode: 1, beat: 3 },
          pushable: true,
          meta: { episode: 1, beat: 3 },
        }),
        projectAsset({
          id: "identity",
          tab: "characters",
          kind: "identity",
          role: "character_identity",
          label: "角色甲",
          url: "/static/project-1/characters/a.png",
        }),
        projectAsset({
          id: "legacy-world",
          tab: "director",
          kind: "director",
          role: "scene_3gs_master_ply",
          label: "中庭 / 正面世界",
          url: "/static/project-1/scenes/courtyard/master.sog",
          media_type: "file",
          meta: {},
        }),
      ],
    });

    expect(assets.map((asset) => asset.id)).toEqual([
      "director-combined",
      "identity",
      "legacy-world",
    ]);
    expect(assets.map((asset) => asset.tab)).toEqual([
      "beat",
      "characters",
      "scenes",
    ]);
    expect(assets[0]?.source).toMatchObject({
      projectId: "project-1",
      episode: 1,
      beat: 3,
      pushable: true,
      slot_target: { kind: "director_render", episode: 1, beat: 3 },
      director_control_bundle: {
        schema_version: "director_control_bundle_v1",
      },
    });
  });

  it("adds supported preset references only outside the default canvas", () => {
    const metadata = {
      references: [
        {
          kind: "frame",
          role: "current_frame",
          label: "当前成图候选",
          rel_path: "assets/episodes/ep001/beat_04/frame.png",
          url: "/static/project-1/episodes/ep001/beat_04/frame.png",
        },
        {
          kind: "audio",
          role: "current_audio",
          label: "当前音频",
          rel_path: "assets/episodes/ep001/beat_04/audio.wav",
          url: "/static/project-1/episodes/ep001/beat_04/audio.wav",
        },
        {
          kind: "identity",
          role: "character_identity",
          label: "角色甲",
          rel_path: "assets/characters/a.png",
          url: "/static/project-1/characters/a.png",
        },
        {
          kind: "frame",
          role: "current_frame",
          label: "临时分镜",
          rel_path: "freezone/uploads/frame.png",
          url: "/static/project-1/freezone/uploads/frame.png",
        },
      ],
    };
    const input = {
      project: "project-1",
      metadata,
      projectAssets: [],
      beatContext: null,
    };

    expect(buildLibraryAssets({ ...input, canvasKind: "default" })).toEqual([]);
    expect(buildLibraryAssets({ ...input, canvasKind: "beat" })).toMatchObject([
      {
        label: "当前分镜",
        tab: "beat",
        aspectRatio: "16:9",
        mediaType: "image",
        source: { from_preset_reference: true, from_beat_context: true },
      },
      {
        label: "当前音频",
        tab: "beat",
        aspectRatio: "1:1",
        mediaType: "audio",
        source: { from_preset_reference: true, from_beat_context: true },
      },
    ]);
  });
});
