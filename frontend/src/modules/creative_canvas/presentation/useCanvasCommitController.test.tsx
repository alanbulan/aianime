// Copyright (c) 2026 AI anime
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  canvasCommitEvents,
  publishCanvasAssetsUpdated,
  publishCanvasCommitRequested,
} from "../application/canvasCommitEvents";
import type {
  CanvasCommitNode,
  CanvasCommitStore,
} from "../application/canvasCommitRules";

import {
  createUseCanvasCommitController,
  type CanvasCommitControllerOptions,
} from "./useCanvasCommitController";

const mocks = {
  cacheBustImage: vi.fn((url: string) => url),
  commitAsset: vi.fn(),
  commitDirectorRender: vi.fn(),
  commitSceneDirectorWorld: vi.fn(),
  invalidateTarget: vi.fn(),
  saveOpenDirectorWorldScene: vi.fn(),
  updateNodeData: vi.fn(),
};

let nodes: CanvasCommitNode[] = [];

const store: CanvasCommitStore = {
  read: () => ({
    nodes,
    updateNodeData(nodeId, patch) {
      mocks.updateNodeData(nodeId, patch);
      const node = nodes.find((candidate) => candidate.id === nodeId);
      if (node) node.data = { ...(node.data as object), ...patch };
    },
  }),
};

const useCanvasCommitController = createUseCanvasCommitController({
  store,
  events: canvasCommitEvents,
  cacheBustImage: mocks.cacheBustImage,
  now: () => new Date("2026-08-02T08:00:00.000Z"),
  saveOpenDirectorWorldScene: mocks.saveOpenDirectorWorldScene,
  commitAsset: mocks.commitAsset,
  commitDirectorRender: mocks.commitDirectorRender,
  commitSceneDirectorWorld: mocks.commitSceneDirectorWorld,
  useCommittedTargetInvalidator: () => mocks.invalidateTarget,
});

function node(
  id: string,
  type: string,
  data: Record<string, unknown>,
): CanvasCommitNode {
  return { id, type, data };
}

function options(
  overrides: Partial<CanvasCommitControllerOptions> = {},
): CanvasCommitControllerOptions {
  return {
    projectId: "project-a",
    flush: vi.fn(async () => true),
    onAssetsChanged: vi.fn(),
    onMessage: vi.fn(),
    ...overrides,
  };
}

describe("Creative Canvas commit controller", () => {
  beforeEach(() => {
    nodes = [];
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.cacheBustImage.mockImplementation((url: string) => url);
    mocks.saveOpenDirectorWorldScene.mockResolvedValue(false);
    mocks.commitAsset.mockResolvedValue({
      target_path: "renders/ep001/beat_02.png",
      target_url: "/static/frame.png?v=2",
      backup: null,
    });
    mocks.commitDirectorRender.mockResolvedValue({
      target_path: "renders/ep001/beat_02.png",
      target_url: "/static/director.png?v=2",
      backup: null,
    });
    mocks.commitSceneDirectorWorld.mockResolvedValue({
      target_path: "director_worlds/hall/world.json",
      target_url: "/static/director_worlds/hall/world.json?v=2",
      backup: null,
    });
  });

  afterEach(() => cleanup());

  it("subscribes to module events and releases both subscriptions", () => {
    const controllerOptions = options();
    const hook = renderHook(() =>
      useCanvasCommitController(controllerOptions),
    );

    act(() => {
      publishCanvasCommitRequested({ nodeId: "missing" });
      publishCanvasAssetsUpdated();
    });
    expect(controllerOptions.onMessage).toHaveBeenCalledWith(
      "当前节点没有可提交的内容",
    );
    expect(controllerOptions.onAssetsChanged).toHaveBeenCalledOnce();

    hook.unmount();
    act(() => {
      publishCanvasCommitRequested({ nodeId: "missing" });
      publishCanvasAssetsUpdated();
    });
    expect(controllerOptions.onMessage).toHaveBeenCalledOnce();
    expect(controllerOptions.onAssetsChanged).toHaveBeenCalledOnce();
  });

  it("flushes an open world before exposing the latest manual commit state", async () => {
    nodes = [
      node("candidate", "uploadNode", {
        imageUrl: "/static/generated.png",
        previewImageUrl: "/static/generated-preview.png",
        displayName: "候选场景",
        user_spawned: true,
        slot_target: { kind: "scene_master", scene_id: "hall" },
      }),
    ];
    mocks.saveOpenDirectorWorldScene.mockImplementationOnce(async () => {
      store.read().updateNodeData("candidate", {
        imageUrl: "/static/latest.png",
        previewImageUrl: "/static/latest-preview.png",
      });
      return true;
    });
    const controllerOptions = options();
    const hook = renderHook(() =>
      useCanvasCommitController(controllerOptions),
    );

    act(() => publishCanvasCommitRequested({ nodeId: "candidate" }));
    await waitFor(() => {
      expect(hook.result.current.prompt?.sourceUrl).toBe("/static/latest.png");
    });
    expect(controllerOptions.flush).toHaveBeenCalledOnce();
    expect(hook.result.current.prompt).toMatchObject({
      nodeId: "candidate",
      previewUrl: "/static/latest-preview.png",
      sourceLabel: "候选场景",
      mediaType: "image",
      defaultTarget: { kind: "scene_master", scene_id: "hall" },
    });

    act(() => {
      hook.result.current.handlePromptSuccess(
        "提交完成",
        {
          target_path: "scenes/hall/master.png",
          target_url: "/static/scenes/hall/master.png?v=2",
          backup: null,
        },
        { kind: "scene_master", scene_id: "hall" },
        { imageUrl: "/static/scenes/hall/master.png?v=2" },
      );
    });
    expect(mocks.invalidateTarget).toHaveBeenCalledWith({
      kind: "scene_master",
      scene_id: "hall",
    });
    expect(nodes[0]?.data).toMatchObject({
      imageUrl: "/static/scenes/hall/master.png?v=2",
      committed_slot_url: "/static/scenes/hall/master.png?v=2",
      committed_at: "2026-08-02T08:00:00.000Z",
    });
  });

  it("auto-commits ordinary targets and refreshes canonical nodes", async () => {
    nodes = [
      node("candidate", "uploadNode", {
        imageUrl: "/static/generated.png",
        user_spawned: true,
        slot_target: { kind: "frame", episode: 1, beat: 2 },
      }),
      node("canonical", "uploadNode", {
        imageUrl: "/static/old-frame.png",
        slot_target: { kind: "frame", episode: 1, beat: 2 },
      }),
    ];
    const controllerOptions = options();
    renderHook(() => useCanvasCommitController(controllerOptions));

    act(() => publishCanvasCommitRequested({
      nodeId: "candidate",
      auto: true,
      successMessage: "已设为当前背景",
    }));
    await waitFor(() => {
      expect(controllerOptions.onAssetsChanged).toHaveBeenCalledOnce();
    });
    expect(mocks.commitAsset).toHaveBeenCalledWith(
      "project-a",
      "/static/generated.png",
      { kind: "frame", episode: 1, beat: 2 },
      { mark_stale: false },
    );
    expect(nodes[0]?.data).toMatchObject({
      imageUrl: "/static/frame.png?v=2",
      committed_at: "2026-08-02T08:00:00.000Z",
    });
    expect(nodes[1]?.data).toMatchObject({
      imageUrl: "/static/frame.png?v=2",
      previewImageUrl: "/static/frame.png?v=2",
      committed_slot_url: "/static/frame.png?v=2",
    });
    expect(controllerOptions.flush).toHaveBeenCalledTimes(2);
    expect(controllerOptions.onMessage).toHaveBeenLastCalledWith(
      "已设为当前背景",
    );
  });

  it("routes director render and director-world source commits", async () => {
    nodes = [
      node("director", "uploadNode", {
        imageUrl: "/static/director-source.png",
        previewImageUrl: "/static/director-preview.png",
        displayName: "导演合成候选",
        director_control_bundle: { version: 1 },
        user_spawned: true,
        slot_target: { kind: "director_render", episode: 1, beat: 2 },
      }),
    ];
    const controllerOptions = options();
    renderHook(() => useCanvasCommitController(controllerOptions));

    act(() => publishCanvasCommitRequested({ nodeId: "director", auto: true }));
    await waitFor(() => {
      expect(mocks.commitDirectorRender).toHaveBeenCalledOnce();
    });
    expect(mocks.commitDirectorRender).toHaveBeenCalledWith(
      "project-a",
      { kind: "director_render", episode: 1, beat: 2 },
      expect.objectContaining({
        sourceUrl: "/static/director-source.png",
        sourceNodeId: "director",
        bundle: { version: 1 },
      }),
    );

    nodes = [
      node("model", "threeDWorldNode", {
        activeSourceId: "custom-local",
        plyUrl: "/static/fallback.sog",
        scene: { world: { activeSourceId: "custom-local" } },
        scenesBySourceId: {
          "custom-local": { world: { activeSourceId: "custom-local" } },
        },
        sources: [{
          id: "custom-local",
          source_type: "sog",
          source_kind: "custom",
          ply_url: "/static/custom-local.sog",
          current: true,
        }],
        user_spawned: true,
        slot_target: { kind: "scene_3gs_master_ply", scene_id: "hall" },
      }),
    ];
    mocks.commitAsset.mockResolvedValueOnce({
      target_path: "director_worlds/hall/v1/master.sog",
      target_url: "/static/director_worlds/hall/v1/master.sog?v=3",
      backup: null,
    });
    act(() => publishCanvasCommitRequested({ nodeId: "model", auto: true }));
    await waitFor(() => {
      expect(mocks.commitSceneDirectorWorld).toHaveBeenCalledOnce();
    });
    expect(mocks.commitAsset).toHaveBeenLastCalledWith(
      "project-a",
      "/static/custom-local.sog",
      { kind: "scene_3gs_master_ply", scene_id: "hall" },
      { mark_stale: false },
    );
    expect(mocks.commitSceneDirectorWorld).toHaveBeenCalledWith(
      "project-a",
      { kind: "scene_director_world", scene_id: "hall" },
      expect.objectContaining({
        activeSourceId: "custom-local",
        committed_slot_url: "/static/director_worlds/hall/v1/master.sog?v=3",
      }),
      { pruneStale: false },
    );
  });
});
