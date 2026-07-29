// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  beatAssetItems,
  countAssetsForTab,
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
