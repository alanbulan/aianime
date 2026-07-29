// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  beatAssetItems,
  buildAssetLibraryTabs,
  countAssetsForTab,
  filterAssetLibraryAssets,
  groupBeatAssets,
  resolveCanvasKind,
  resolveCurrentBeat,
  resolveCurrentEpisode,
  sceneAssetTypeBadge,
} from "./assetLibraryViewModel";
import type { LibraryAsset } from "../domain/assetLibraryModel";

function libraryAsset(
  id: string,
  overrides: Partial<LibraryAsset>,
): LibraryAsset {
  return {
    id,
    tab: "beat",
    kind: "reference",
    role: "reference",
    label: id,
    url: `/static/${id}`,
    aspectRatio: "1:1",
    mediaType: "image",
    source: {},
    ...overrides,
  };
}

describe("assetLibraryViewModel", () => {
  it("orders the supported Beat output roles", () => {
    const selectedBackground = libraryAsset("background", {
      role: "selected_background",
    });
    const frame = libraryAsset("frame", { role: "current_frame" });
    const audio = libraryAsset("audio", { role: "current_audio" });
    const sketch = libraryAsset("sketch", { role: "current_sketch" });

    expect(beatAssetItems([
      selectedBackground,
      frame,
      audio,
      sketch,
    ])).toEqual([
      { role: "current_sketch", label: "草图", asset: sketch },
      { role: "current_frame", label: "分镜", asset: frame },
      { role: "selected_background", label: "背景", asset: selectedBackground },
    ]);
  });

  it("groups Beat context assets in the stable presentation order", () => {
    const output = libraryAsset("output", { kind: "frame" });
    const director = libraryAsset("director", { kind: "director" });
    const character = libraryAsset("character", { kind: "identity" });
    const scene = libraryAsset("scene", { kind: "scene" });
    const prop = libraryAsset("prop", { kind: "prop" });
    const other = libraryAsset("other", { kind: "document" });

    expect(groupBeatAssets([
      other,
      prop,
      director,
      scene,
      output,
      character,
    ])).toEqual([
      { id: "outputs", label: "当前产物", assets: [output] },
      { id: "director", label: "3GS / 控制图", assets: [director] },
      { id: "characters", label: "角色参考", assets: [character] },
      { id: "scenes", label: "场景参考", assets: [scene] },
      { id: "props", label: "道具参考", assets: [prop] },
      { id: "other", label: "其他上下文", assets: [other] },
    ]);
  });

  it("projects scene badges and tab counts from asset roles", () => {
    const beat = libraryAsset("beat", {
      source: { from_beat_context: true },
    });
    const projectBeat = libraryAsset("project-beat", {
      source: { from_beat_context: false },
    });
    const scene = libraryAsset("scene", {
      tab: "scenes",
      kind: "scene",
      role: "scene_master",
    });
    const world = libraryAsset("world", {
      tab: "scenes",
      kind: "director",
      role: "scene_director_world",
      mediaType: "file",
    });
    const assets = [beat, projectBeat, scene, world];

    expect(countAssetsForTab(assets, "beat")).toBe(1);
    expect(countAssetsForTab(assets, "scenes")).toBe(2);
    expect(sceneAssetTypeBadge(scene)).toEqual({
      label: "正面图",
      title: "场景正面图",
      className: "border-primary/30 bg-primary/10 text-primary",
    });
    expect(sceneAssetTypeBadge(world)).toEqual({
      label: "导演世界",
      title: "场景导演世界",
      className: "border-secondary bg-secondary text-secondary-foreground",
    });
    expect(sceneAssetTypeBadge(beat)).toBeNull();
  });

  it("builds stable library tabs with canvas-specific Beat labels", () => {
    const beat = libraryAsset("beat", {
      source: { from_beat_context: true },
    });
    const scene = libraryAsset("scene", { tab: "scenes" });

    expect(buildAssetLibraryTabs("default", [beat, scene])).toEqual([
      { id: "beat", label: "全部Beat", count: 1 },
      { id: "characters", label: "人物", count: 0 },
      { id: "scenes", label: "场景", count: 1 },
      { id: "props", label: "道具", count: 0 },
    ]);
    expect(buildAssetLibraryTabs("episode", [])).toEqual(
      expect.arrayContaining([
        { id: "beat", label: "本集Beat", count: 0 },
      ]),
    );
    expect(buildAssetLibraryTabs("beat", [beat])[0]).toEqual({
      id: "beat",
      label: "当前Beat",
      count: 1,
    });
  });

  it("filters the selected tab by normalized asset search text", () => {
    const beat = libraryAsset("beat", {
      label: "当前分镜",
      source: { from_beat_context: true },
    });
    const hiddenBeat = libraryAsset("hidden-beat", {
      label: "旧分镜",
      source: { from_beat_context: false },
    });
    const scene = libraryAsset("scene", {
      tab: "scenes",
      label: "Kitchen",
      sublabel: "Night Interior",
      kind: "scene",
      role: "scene_master",
    });
    const assets = [beat, hiddenBeat, scene];

    expect(filterAssetLibraryAssets(assets, "beat", "")).toEqual([beat]);
    expect(filterAssetLibraryAssets(assets, "scenes", " night ")).toEqual([
      scene,
    ]);
    expect(filterAssetLibraryAssets(assets, "scenes", "MASTER")).toEqual([
      scene,
    ]);
    expect(filterAssetLibraryAssets(assets, "characters", "")).toEqual([]);
  });

  it("resolves canvas scope and target coordinates from preset metadata", () => {
    const metadata = {
      preset: { scope: "beat", episode: 2, beat: 7 },
      default_push_target: { episode: 9, beat: 11 },
    };

    expect(resolveCanvasKind(metadata)).toBe("beat");
    expect(resolveCurrentEpisode(metadata)).toBe(2);
    expect(resolveCurrentBeat(metadata)).toBe(7);
    expect(resolveCanvasKind({ preset: { scope: "unknown" } })).toBe("default");
    expect(resolveCurrentEpisode({ default_push_target: { episode: 9 } })).toBe(9);
    expect(resolveCurrentBeat({ default_push_target: { beat: 11 } })).toBe(11);
    expect(resolveCurrentEpisode(null)).toBeNull();
    expect(resolveCurrentBeat(null)).toBeNull();
  });
});
