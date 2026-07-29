// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  defaultCharacterFromMetadata,
  inferCanonicalRefreshTarget,
  nodeDataPatchAfterCommittedSourceSlot,
  nodeDataPatchAfterCommittedTarget,
  normalizePushTarget,
  pushTargetsEqual,
  renderCommitSuccessMessage,
  resolveSubmitNodeData,
  sceneDirectorWorldDataForManifest,
  shouldRefreshCommittedTargetNodes,
} from "./canvasCommitRules";

describe("Freezone canvas commit rules", () => {
  it("does not refresh canvas node urls after scene director world manifest commits", () => {
    expect(shouldRefreshCommittedTargetNodes({
      kind: "scene_director_world",
      scene_id: "公寓楼电梯间",
    })).toBe(false);
    expect(shouldRefreshCommittedTargetNodes({
      kind: "scene_3gs_master_ply",
      scene_id: "公寓楼电梯间",
    })).toBe(true);
  });

  it("uses latest canvas node data for structured submit payloads", () => {
    const fallback = { scene: { camera: "old" } };
    const latest = { scene: { camera: "new" } };

    expect(resolveSubmitNodeData(latest, fallback)).toBe(latest);
    expect(resolveSubmitNodeData(null, fallback)).toBe(fallback);
  });

  it("builds a temporary director-world payload for source slot manifest sync", () => {
    const scene = {
      world: { activeSourceId: "custom-local" },
      actors: [{ id: "actor-1" }],
    };
    const nodeData = {
      user_spawned: true,
      activeSourceId: "custom-local",
      scene,
      scenesBySourceId: { "custom-local": scene },
      sources: [
        {
          id: "custom-local",
          source_type: "sog",
          source_kind: "custom",
          ply_url: "/static/proj/freezone/generated/custom.sog",
          current: true,
        },
      ],
    };
    const target = {
      kind: "scene_3gs_master_ply" as const,
      scene_id: "公寓楼电梯间",
    };
    const result = {
      target_path: "director_worlds/公寓楼电梯间/v1/master.sog",
      target_url: "/static/proj/director_worlds/公寓楼电梯间/v1/master.sog?v=1",
      backup: null,
    };
    const patch = nodeDataPatchAfterCommittedSourceSlot(
      nodeData,
      target,
      result,
      "proj",
    );

    expect(
      sceneDirectorWorldDataForManifest(nodeData, target, result, "proj"),
    ).toEqual(patch);
    expect(
      sceneDirectorWorldDataForManifest(
        { user_spawned: true },
        target,
        result,
        "proj",
      ),
    ).toBeNull();

    expect(patch).toMatchObject({
      activeSourceId: "custom-local",
      displayName: "已提交 · 公寓楼电梯间 / 正面世界",
      plyUrl: "/static/proj/director_worlds/公寓楼电梯间/v1/master.sog?v=1",
      sourceFileName: "master.sog",
      slot_target: { kind: "scene_3gs_master_ply", scene_id: "公寓楼电梯间" },
      committed_slot_url: "/static/proj/director_worlds/公寓楼电梯间/v1/master.sog?v=1",
      committed_target_label: "公寓楼电梯间 / 正面世界",
      mainline_context: undefined,
      scene: { world: { activeSourceId: "custom-local" } },
      scenesBySourceId: {
        "custom-local": { world: { activeSourceId: "custom-local" } },
      },
    });
    expect((patch?.sources as Array<{ id: string; current?: boolean; label?: string }>)).toEqual([
      expect.objectContaining({ id: "custom-local", current: true }),
    ]);
    expect(
      (patch?.sources as Array<{ label?: string }>).some(
        (source) => source.label === "正面世界",
      ),
    ).toBe(false);
  });

  it("does not rewrite the canvas node after a director-world source slot commit", () => {
    expect(nodeDataPatchAfterCommittedTarget(
      {
        user_spawned: true,
        activeSourceId: "custom-local",
        plyUrl: "/static/proj/freezone/generated/custom.sog",
      },
      { kind: "scene_3gs_master_ply", scene_id: "公寓楼电梯间" },
      {
        target_path: "director_worlds/公寓楼电梯间/v1/master.sog",
        target_url: "/static/proj/director_worlds/公寓楼电梯间/v1/master.sog?v=1",
        backup: null,
      },
      "proj",
    )).toBeNull();
  });

  it("canonicalizes ordinary image-like commits back into mainline canvas identity", () => {
    const patch = nodeDataPatchAfterCommittedTarget(
      {
        imageUrl: "/static/proj/freezone/generated/frame.png",
        user_spawned: true,
        slot_target: { kind: "frame", episode: 1, beat: 3 },
      },
      { kind: "frame", episode: 1, beat: 3 },
      {
        target_path: "renders/ep001/beat_03.png",
        target_url: "/static/proj/renders/ep001/beat_03.png?v=2",
        backup: null,
      },
      "proj",
    );

    expect(patch).toMatchObject({
      imageUrl: "/static/proj/renders/ep001/beat_03.png?v=2",
      previewImageUrl: "/static/proj/renders/ep001/beat_03.png?v=2",
      displayName: "已提交 · EP1 / Beat 3 / 分镜",
      sourceFileName: "beat_03.png",
      slot_target: { kind: "frame", episode: 1, beat: 3 },
      committed_slot_url: "/static/proj/renders/ep001/beat_03.png?v=2",
      committed_target_label: "EP1 / Beat 3 / 分镜",
      mainline_context: undefined,
    });
  });

  it("canonicalizes video, audio, identity, and prop commits", () => {
    expect(nodeDataPatchAfterCommittedTarget(
      { videoUrl: "/tmp/video.mp4" },
      { kind: "video", episode: 2, beat: 4 },
      { target_path: "videos/ep002/beat_04.mp4", target_url: "/static/video.mp4", backup: null },
      "proj",
    )).toMatchObject({
      videoUrl: "/static/video.mp4",
      previewImageUrl: "/static/video.mp4",
      displayName: "EP2 / Beat 4 / 视频",
      mainline_context: [expect.objectContaining({ kind: "video", episode: 2, beat: 4 })],
    });
    expect(nodeDataPatchAfterCommittedTarget(
      { audioUrl: "/tmp/audio.wav" },
      { kind: "beat_audio", episode: 2, beat: 4 },
      { target_path: "audio/ep002/beat_04.wav", target_url: "/static/audio.wav", backup: null },
      "proj",
    )).toMatchObject({
      audioUrl: "/static/audio.wav",
      url: "/static/audio.wav",
      displayName: "EP2 / Beat 4 / 音频",
      mainline_context: [expect.objectContaining({ kind: "audio", audioRole: "beat_audio" })],
    });
    expect(nodeDataPatchAfterCommittedTarget(
      { imageUrl: "/tmp/identity.png" },
      { kind: "identity", character: "杜晨", identity_id: "default" },
      { target_path: "characters/duchen/default.png", target_url: "/static/identity.png", backup: null },
      "proj",
    )).toMatchObject({
      imageUrl: "/static/identity.png",
      displayName: "杜晨 / default / 身份",
      __freezone_source: { meta: { character: "杜晨", identity_id: "default" } },
      mainline_context: [expect.objectContaining({
        kind: "identity",
        character: "杜晨",
        identityId: "default",
      })],
    });
    expect(nodeDataPatchAfterCommittedTarget(
      { imageUrl: "/tmp/prop.png" },
      { kind: "prop_ref", prop_id: "纸箱" },
      { target_path: "props/box.png", target_url: "/static/prop.png", backup: null },
      "proj",
    )).toMatchObject({
      imageUrl: "/static/prop.png",
      displayName: "纸箱 / 道具",
      __freezone_source: { meta: { prop_id: "纸箱", prop: "纸箱" } },
      mainline_context: [expect.objectContaining({ kind: "prop", propId: "纸箱" })],
    });
  });

  it("normalizes partial targets and compares canonical target identity", () => {
    expect(normalizePushTarget(null)).toBeNull();
    expect(normalizePushTarget({ episode: 1, beat: 2 })).toBeNull();
    expect(normalizePushTarget({ kind: "frame", episode: 1, beat: 2 })).toEqual({
      kind: "frame",
      episode: 1,
      beat: 2,
    });
    expect(pushTargetsEqual(
      { kind: "frame", episode: 1, beat: 2 },
      { kind: "frame", episode: 1, beat: 2 },
    )).toBe(true);
    expect(pushTargetsEqual(
      { kind: "frame", episode: 1, beat: 3 },
      { kind: "frame", episode: 1, beat: 2 },
    )).toBe(false);
    expect(pushTargetsEqual(
      { kind: "scene_master", scene_id: "hall" },
      { kind: "scene_master", scene_id: "hall" },
    )).toBe(true);
  });

  it("infers canonical refresh targets from source metadata", () => {
    expect(inferCanonicalRefreshTarget(undefined)).toBeUndefined();
    expect(inferCanonicalRefreshTarget({
      kind: "audio",
      meta: { episode: 2, beat: 4 },
    })).toEqual({ kind: "beat_audio", episode: 2, beat: 4 });
    expect(inferCanonicalRefreshTarget({
      kind: "scene",
      role: "scene_3gs_master_ply",
      meta: { scene_id: "hall" },
    })).toEqual({ kind: "scene_3gs_master_ply", scene_id: "hall" });
  });

  it("projects default character and commit success messages", () => {
    expect(defaultCharacterFromMetadata({ preset: { character: "杜晨" } })).toBe("杜晨");
    expect(defaultCharacterFromMetadata({ preset: { character: "" } })).toBeNull();
    expect(renderCommitSuccessMessage(
      { kind: "director_render", episode: 1, beat: 2 },
      { target_path: "render.png", target_url: "/render.png", backup: null },
    )).toBe("已提交导演合成资产：render.png（含纯背景和元数据）");
    expect(renderCommitSuccessMessage(
      { kind: "scene_director_world", scene_id: "hall" },
      { target_path: "world.json", target_url: "/world.json", backup: null },
    )).toBe("已提交导演世界：world.json");
    expect(renderCommitSuccessMessage(
      { kind: "frame", episode: 1, beat: 2 },
      {
        target_path: "render.png",
        target_url: "/render.png",
        backup: "render.backup.png",
        stale_marked: 3,
      },
    )).toBe(
      "已提交到 render.png(旧文件 backup 至 render.backup.png)；已标记 3 个镜头需重生",
    );
  });
});
