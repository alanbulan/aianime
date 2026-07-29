// Copyright (c) 2026 AI anime
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { canvasEventBus } from "@/features/canvas/application/canvasServices";
import { useCanvasStore, type CanvasNode } from "@/features/canvas/canvasStore";
import { CANVAS_NODE_TYPES, type CanvasNodeType } from "@/features/canvas/domain/canvasNodes";
import { queryKeys } from "@/lib/query-keys";

import {
  useCanvasCommitController,
  type CanvasCommitControllerOptions,
} from "./useCanvasCommitController";

const mocks = vi.hoisted(() => ({
  commitDirectorRenderFromCanvasSource: vi.fn(),
  commitSceneDirectorWorldFromCanvasNode: vi.fn(),
  promoteToAsset: vi.fn(),
  saveOpenDirectorWorldScene: vi.fn(),
}));

vi.mock("../composition", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../composition")>()),
  commitDirectorRenderFromCanvasSource: mocks.commitDirectorRenderFromCanvasSource,
  commitFreezoneAsset: mocks.promoteToAsset,
}));

vi.mock("../commit/sceneDirectorWorldCommit", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("../commit/sceneDirectorWorldCommit")
  >();
  return {
    ...original,
    commitSceneDirectorWorldFromCanvasNode:
      mocks.commitSceneDirectorWorldFromCanvasNode,
  };
});

vi.mock("@/features/canvas/domain/directorWorldSceneSaveRegistry", () => ({
  saveOpenDirectorWorldScene: mocks.saveOpenDirectorWorldScene,
}));

function canvasNode(
  id: string,
  type: CanvasNodeType,
  data: Record<string, unknown>,
): CanvasNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data,
  } as CanvasNode;
}

function createOptions(
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

function renderController(options: CanvasCommitControllerOptions) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return {
    ...renderHook(() => useCanvasCommitController(options), { wrapper }),
    queryClient,
  };
}

describe("canvas commit controller", () => {
  beforeEach(() => {
    useCanvasStore.setState({ nodes: [], edges: [] });
    mocks.commitDirectorRenderFromCanvasSource.mockReset().mockResolvedValue({
      target_path: "renders/ep001/beat_02.png",
      target_url: "/static/director.png?v=2",
      backup: null,
    });
    mocks.commitSceneDirectorWorldFromCanvasNode.mockReset().mockResolvedValue({
      target_path: "director_worlds/hall/world.json",
      target_url: "/static/director_worlds/hall/world.json?v=2",
      backup: null,
    });
    mocks.promoteToAsset.mockReset().mockResolvedValue({
      target_path: "renders/ep001/beat_02.png",
      target_url: "/static/frame.png?v=2",
      backup: null,
    });
    mocks.saveOpenDirectorWorldScene.mockReset().mockResolvedValue(false);
  });

  afterEach(() => {
    cleanup();
    useCanvasStore.setState({ nodes: [], edges: [] });
  });

  it("reports unusable commit events and releases both subscriptions", () => {
    const options = createOptions();
    const hook = renderController(options);

    act(() => {
      canvasEventBus.publish("freezone/commit-node", { nodeId: "missing" });
      canvasEventBus.publish("freezone/assets-updated", undefined);
    });

    expect(options.onMessage).toHaveBeenCalledWith("当前节点没有可提交的内容");
    expect(options.onAssetsChanged).toHaveBeenCalledTimes(1);

    hook.unmount();
    act(() => {
      canvasEventBus.publish("freezone/commit-node", { nodeId: "missing" });
      canvasEventBus.publish("freezone/assets-updated", undefined);
    });
    expect(options.onMessage).toHaveBeenCalledTimes(1);
    expect(options.onAssetsChanged).toHaveBeenCalledTimes(1);
  });

  it("flushes an open world before presenting the latest manual commit state", async () => {
    useCanvasStore.setState({
      nodes: [canvasNode("candidate", CANVAS_NODE_TYPES.upload, {
        imageUrl: "/static/generated.png",
        previewImageUrl: "/static/generated-preview.png",
        displayName: "候选场景",
        user_spawned: true,
        slot_target: { kind: "scene_master", scene_id: "hall" },
      })],
    });
    mocks.saveOpenDirectorWorldScene.mockImplementationOnce(async () => {
      useCanvasStore.getState().updateNodeData("candidate", {
        imageUrl: "/static/latest.png",
        previewImageUrl: "/static/latest-preview.png",
      });
      return true;
    });
    const options = createOptions();
    const hook = renderController(options);
    const invalidate = vi.spyOn(hook.queryClient, "invalidateQueries");

    act(() => {
      canvasEventBus.publish("freezone/commit-node", { nodeId: "candidate" });
    });

    await waitFor(() => {
      expect(hook.result.current.prompt?.sourceUrl).toBe("/static/latest.png");
    });
    expect(mocks.saveOpenDirectorWorldScene).toHaveBeenCalledWith("candidate");
    expect(options.flush).toHaveBeenCalledTimes(1);
    expect(hook.result.current.prompt).toMatchObject({
      nodeId: "candidate",
      previewUrl: "/static/latest-preview.png",
      sourceLabel: "候选场景",
      mediaType: "image",
      defaultTarget: { kind: "scene_master", scene_id: "hall" },
    });
    expect(hook.result.current.getPromptNodeData()).toMatchObject({
      imageUrl: "/static/latest.png",
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

    expect(hook.result.current.prompt).toBeNull();
    expect(hook.result.current.getPromptNodeData()).toBeNull();
    expect(options.onAssetsChanged).toHaveBeenCalledTimes(1);
    expect(options.onMessage).toHaveBeenLastCalledWith("提交完成");
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.scenes("project-a"),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.scene("project-a", "hall"),
    });
    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === "candidate")?.data,
    ).toMatchObject({
      imageUrl: "/static/scenes/hall/master.png?v=2",
      committed_slot_url: "/static/scenes/hall/master.png?v=2",
      committed_at: expect.any(String),
    });
  });

  it("commits an ordinary target and refreshes its canonical canvas node", async () => {
    useCanvasStore.setState({
      nodes: [
        canvasNode("candidate", CANVAS_NODE_TYPES.upload, {
          imageUrl: "/static/generated.png",
          displayName: "候选分镜",
          user_spawned: true,
          slot_target: { kind: "frame", episode: 1, beat: 2 },
        }),
        canvasNode("canonical", CANVAS_NODE_TYPES.upload, {
          imageUrl: "/static/old-frame.png",
          slot_target: { kind: "frame", episode: 1, beat: 2 },
        }),
      ],
    });
    const options = createOptions();
    renderController(options);

    act(() => {
      canvasEventBus.publish("freezone/commit-node", {
        nodeId: "candidate",
        auto: true,
        successMessage: "已设为当前背景",
      });
    });

    await waitFor(() => {
      expect(options.onAssetsChanged).toHaveBeenCalledTimes(1);
      expect(options.flush).toHaveBeenCalledTimes(2);
    });
    expect(mocks.promoteToAsset).toHaveBeenCalledWith(
      "project-a",
      "/static/generated.png",
      { kind: "frame", episode: 1, beat: 2 },
      { mark_stale: false },
    );
    expect(mocks.commitDirectorRenderFromCanvasSource).not.toHaveBeenCalled();
    expect(mocks.commitSceneDirectorWorldFromCanvasNode).not.toHaveBeenCalled();
    expect(options.onMessage).toHaveBeenNthCalledWith(1, "正在写入当前背景…");
    expect(options.onMessage).toHaveBeenLastCalledWith("已设为当前背景");

    const candidate = useCanvasStore.getState().nodes.find(
      (node) => node.id === "candidate",
    );
    const canonical = useCanvasStore.getState().nodes.find(
      (node) => node.id === "canonical",
    );
    expect(candidate?.data).toMatchObject({
      imageUrl: "/static/frame.png?v=2",
      committed_slot_url: "/static/frame.png?v=2",
      committed_at: expect.any(String),
    });
    expect(canonical?.data).toMatchObject({
      imageUrl: "/static/frame.png?v=2",
      previewImageUrl: "/static/frame.png?v=2",
      committed_slot_url: "/static/frame.png?v=2",
    });
  });

  it("stops automatic commits when the canvas cannot flush", async () => {
    useCanvasStore.setState({
      nodes: [canvasNode("candidate", CANVAS_NODE_TYPES.upload, {
        imageUrl: "/static/generated.png",
        user_spawned: true,
        slot_target: { kind: "frame", episode: 1, beat: 2 },
      })],
    });
    const options = createOptions({ flush: vi.fn(async () => false) });
    renderController(options);

    act(() => {
      canvasEventBus.publish("freezone/commit-node", {
        nodeId: "candidate",
        auto: true,
      });
    });

    await waitFor(() => {
      expect(options.onMessage).toHaveBeenLastCalledWith(
        "当前画布未保存成功，处理冲突后再提交",
      );
    });
    expect(mocks.promoteToAsset).not.toHaveBeenCalled();
    expect(options.onAssetsChanged).not.toHaveBeenCalled();
  });

  it("routes dedicated director render and director world commits", async () => {
    const options = createOptions();
    const hook = renderController(options);
    const invalidate = vi.spyOn(hook.queryClient, "invalidateQueries");
    useCanvasStore.setState({
      nodes: [canvasNode("director", CANVAS_NODE_TYPES.upload, {
        imageUrl: "/static/director-source.png",
        previewImageUrl: "/static/director-preview.png",
        displayName: "导演合成候选",
        director_control_bundle: { version: 1 },
        user_spawned: true,
        slot_target: { kind: "director_render", episode: 1, beat: 2 },
      })],
    });

    act(() => {
      canvasEventBus.publish("freezone/commit-node", {
        nodeId: "director",
        auto: true,
      });
    });
    await waitFor(() => {
      expect(options.onAssetsChanged).toHaveBeenCalledTimes(1);
    });
    expect(mocks.commitDirectorRenderFromCanvasSource).toHaveBeenCalledWith(
      "project-a",
      { kind: "director_render", episode: 1, beat: 2 },
      {
        sourceUrl: "/static/director-source.png",
        previewUrl: "/static/director-preview.png",
        bundle: { version: 1 },
        sourceNodeId: "director",
        label: "导演合成候选",
      },
    );

    useCanvasStore.setState({
      nodes: [canvasNode("world", CANVAS_NODE_TYPES.threeDWorld, {
        plyUrl: "/static/local-world.sog",
        scene: { world: { activeSourceId: "local" } },
        user_spawned: true,
        slot_target: { kind: "scene_director_world", scene_id: "hall" },
      })],
    });
    act(() => {
      canvasEventBus.publish("freezone/commit-node", {
        nodeId: "world",
        auto: true,
      });
    });
    await waitFor(() => {
      expect(options.onAssetsChanged).toHaveBeenCalledTimes(2);
    });

    expect(mocks.commitSceneDirectorWorldFromCanvasNode).toHaveBeenCalledWith(
      "project-a",
      { kind: "scene_director_world", scene_id: "hall" },
      expect.objectContaining({ plyUrl: "/static/local-world.sog" }),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.sceneDirectorStageManifest("project-a", "hall"),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.scenes("project-a"),
    });
    expect(mocks.promoteToAsset).not.toHaveBeenCalled();
  });

  it("syncs director world state after committing a model source slot", async () => {
    useCanvasStore.setState({
      nodes: [canvasNode("model", CANVAS_NODE_TYPES.threeDWorld, {
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
      })],
    });
    mocks.promoteToAsset.mockResolvedValueOnce({
      target_path: "director_worlds/hall/v1/master.sog",
      target_url: "/static/director_worlds/hall/v1/master.sog?v=3",
      backup: null,
    });
    const options = createOptions();
    renderController(options);

    act(() => {
      canvasEventBus.publish("freezone/commit-node", {
        nodeId: "model",
        auto: true,
      });
    });

    await waitFor(() => {
      expect(mocks.commitSceneDirectorWorldFromCanvasNode).toHaveBeenCalledTimes(1);
    });
    expect(mocks.promoteToAsset).toHaveBeenCalledWith(
      "project-a",
      "/static/custom-local.sog",
      { kind: "scene_3gs_master_ply", scene_id: "hall" },
      { mark_stale: false },
    );
    expect(mocks.commitSceneDirectorWorldFromCanvasNode).toHaveBeenCalledWith(
      "project-a",
      { kind: "scene_director_world", scene_id: "hall" },
      expect.objectContaining({
        activeSourceId: "custom-local",
        scene: { world: { activeSourceId: "custom-local" } },
        committed_slot_url: "/static/director_worlds/hall/v1/master.sog?v=3",
      }),
      { pruneStale: false },
    );
    expect(options.onMessage).toHaveBeenLastCalledWith(
      "已提交到 director_worlds/hall/v1/master.sog；已同步导演世界状态",
    );
    expect(options.onAssetsChanged).toHaveBeenCalledTimes(1);
  });
});
