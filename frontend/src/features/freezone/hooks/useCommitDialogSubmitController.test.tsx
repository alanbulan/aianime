// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PushTarget } from "@/features/freezone/domain/assetCommit";

import {
  type CommitDialogSubmitControllerOptions,
  useCommitDialogSubmitController,
} from "./useCommitDialogSubmitController";

const mocks = vi.hoisted(() => ({
  promoteToAsset: vi.fn(),
  commitDirectorRenderFromCanvasSource: vi.fn(),
  commitSceneDirectorWorldFromCanvasNode: vi.fn(),
  hasDirectorWorldSceneState: vi.fn(),
  isDirectorWorldSourceSlotTarget: vi.fn(),
  nodeDataAfterCommittedSlot: vi.fn(),
  renderCommitSuccessMessage: vi.fn(),
}));

vi.mock("../composition", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../composition")>()),
  commitDirectorRenderFromCanvasSource: (...args: unknown[]) =>
    mocks.commitDirectorRenderFromCanvasSource(...args),
  commitFreezoneAsset: (...args: unknown[]) => mocks.promoteToAsset(...args),
  commitSceneDirectorWorldFromCanvasNode: (...args: unknown[]) =>
    mocks.commitSceneDirectorWorldFromCanvasNode(...args),
}));

vi.mock("../domain/directorWorldCommit", () => ({
  hasDirectorWorldSceneState: (...args: unknown[]) =>
    mocks.hasDirectorWorldSceneState(...args),
  isDirectorWorldSourceSlotTarget: (...args: unknown[]) =>
    mocks.isDirectorWorldSourceSlotTarget(...args),
}));

vi.mock("../application/committedNodePatch", () => ({
  nodeDataAfterCommittedSlot: (...args: unknown[]) =>
    mocks.nodeDataAfterCommittedSlot(...args),
}));

vi.mock("../application/canvasCommitRules", () => ({
  renderCommitSuccessMessage: (...args: unknown[]) =>
    mocks.renderCommitSuccessMessage(...args),
}));

function renderController(
  overrides: Partial<CommitDialogSubmitControllerOptions> = {},
) {
  const setError = vi.fn();
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const options: CommitDialogSubmitControllerOptions = {
    project: "demo",
    sourceUrl: "/static/source.png",
    mediaType: "image",
    target: { kind: "frame", episode: 1, beat: 1 },
    modelSlotKinds: [],
    noTargetYet: false,
    isGlobalSlot: false,
    markStale: true,
    ...overrides,
    setError,
    onClose,
    onSuccess,
  };
  const hook = renderHook(() => useCommitDialogSubmitController(options));
  return { ...hook, setError, onClose, onSuccess };
}

describe("commit dialog submit controller", () => {
  beforeEach(() => {
    mocks.promoteToAsset.mockReset().mockResolvedValue({
      target_path: "assets/world.sog",
      target_url: "/static/assets/world.sog",
      backup: null,
    });
    mocks.commitDirectorRenderFromCanvasSource.mockReset().mockResolvedValue({
      target_path: "director/combined.png",
      target_url: "/static/director/combined.png",
      backup: null,
    });
    mocks.commitSceneDirectorWorldFromCanvasNode.mockReset().mockResolvedValue({
      target_path: "director/world.json",
      target_url: "/static/director/world.json",
      backup: null,
    });
    mocks.hasDirectorWorldSceneState.mockReset().mockReturnValue(true);
    mocks.isDirectorWorldSourceSlotTarget
      .mockReset()
      .mockImplementation(
        (target: { kind: string }) =>
          target.kind === "scene_director_pano_360" ||
          target.kind === "scene_3gs_master_ply" ||
          target.kind === "scene_3gs_reverse_ply" ||
          target.kind === "scene_3gs_pano_ply" ||
          target.kind === "scene_3gs_custom_scene",
      );
    mocks.nodeDataAfterCommittedSlot
      .mockReset()
      .mockReturnValue({ scene: { objects: [] } });
    mocks.renderCommitSuccessMessage.mockReset().mockReturnValue("提交成功");
  });

  it("commits the latest model source and synchronizes its director world state", async () => {
    const target: PushTarget = {
      kind: "scene_3gs_custom_scene",
      scene_id: "电梯间",
    };
    const latestNodeData = { plyUrl: "/static/latest-world.sog" };
    const { result, setError, onClose, onSuccess } = renderController({
      sourceUrl: "/static/stale-world.sog",
      mediaType: "model",
      target,
      modelSlotKinds: ["scene_3gs_custom_scene"],
      isGlobalSlot: true,
      getNodeData: () => latestNodeData,
    });

    expect(result.current.ready).toBe(true);
    await act(async () => {
      await result.current.submit();
    });

    expect(mocks.promoteToAsset).toHaveBeenCalledWith(
      "demo",
      "/static/latest-world.sog",
      target,
      { mark_stale: true },
    );
    expect(mocks.nodeDataAfterCommittedSlot).toHaveBeenCalledWith(
      latestNodeData,
      target,
      expect.objectContaining({ target_url: "/static/assets/world.sog" }),
      "demo",
    );
    expect(mocks.commitSceneDirectorWorldFromCanvasNode).toHaveBeenCalledWith(
      "demo",
      { kind: "scene_director_world", scene_id: "电梯间" },
      { scene: { objects: [] } },
      { pruneStale: false },
    );
    expect(onSuccess).toHaveBeenCalledWith(
      "提交成功；已同步导演世界状态",
      expect.objectContaining({ target_url: "/static/assets/world.sog" }),
      target,
      { scene: { objects: [] } },
    );
    expect(setError).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalledOnce();
    expect(result.current.submitting).toBe(false);
  });

  it("uses the dedicated director render commit path", async () => {
    const target: PushTarget = {
      kind: "director_render",
      episode: 2,
      beat: 4,
    };
    const bundle = { schema_version: "director_control_frame_v1" };
    const { result, onClose, onSuccess } = renderController({
      sourceUrl: "/static/combined.png",
      previewUrl: "/static/preview.png",
      target,
      directorControlBundle: bundle,
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(mocks.commitDirectorRenderFromCanvasSource).toHaveBeenCalledWith(
      "demo",
      target,
      {
        sourceUrl: "/static/combined.png",
        previewUrl: "/static/preview.png",
        bundle,
      },
    );
    expect(mocks.promoteToAsset).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith(
      "提交成功",
      expect.objectContaining({ target_url: "/static/director/combined.png" }),
      target,
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("uses the structured commit path for a complete director world", async () => {
    const target: PushTarget = {
      kind: "scene_director_world",
      scene_id: "电梯间",
    };
    const latestNodeData = { scene: { objects: [{ id: "chair" }] } };
    const { result, onClose, onSuccess } = renderController({
      mediaType: "model",
      target,
      getNodeData: () => latestNodeData,
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(mocks.commitSceneDirectorWorldFromCanvasNode).toHaveBeenCalledWith(
      "demo",
      target,
      latestNodeData,
    );
    expect(mocks.promoteToAsset).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith(
      "提交成功",
      expect.objectContaining({ target_url: "/static/director/world.json" }),
      target,
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("rejects a model slot that has no matching source", async () => {
    const target: PushTarget = {
      kind: "scene_3gs_custom_scene",
      scene_id: "电梯间",
    };
    const { result, setError, onClose } = renderController({
      mediaType: "model",
      target,
      modelSlotKinds: [],
      noTargetYet: true,
    });

    expect(result.current.ready).toBe(false);
    await act(async () => {
      await result.current.submit();
    });

    expect(setError).toHaveBeenLastCalledWith(
      "无来源没有可提交的 3D 世界素材；请切换到具体世界来源后再提交到主线槽位。",
    );
    expect(mocks.promoteToAsset).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(result.current.submitting).toBe(false);
  });
});
