// Copyright (c) 2026 AI anime
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryAsset } from "../domain/assetLibraryModel";
import {
  useAssetLibraryReplacementController,
  type AssetLibraryPendingReplacement,
  type AssetLibraryReplacementHandler,
} from "./useAssetLibraryReplacementController";

const mocks = vi.hoisted(() => ({
  commitDirectorRenderFromCanvasSource: vi.fn(),
  promoteToAsset: vi.fn(),
}));

vi.mock("../directorCommitComposition", () => ({
  commitDirectorRenderFromCanvasSource:
    mocks.commitDirectorRenderFromCanvasSource,
}));

vi.mock("../assetTransferComposition", () => ({
  commitFreezoneAsset: mocks.promoteToAsset,
}));

let pendingReplacement: AssetLibraryPendingReplacement | null = null;
const clearPendingReplacement = vi.fn(() => {
  pendingReplacement = null;
});

function asset(
  id: string,
  source: Record<string, unknown>,
): LibraryAsset {
  return {
    id,
    tab: "beat",
    kind: "frame",
    role: "current_frame",
    label: id,
    url: `/static/${id}.png`,
    aspectRatio: "16:9",
    mediaType: "image",
    source,
  };
}

function setPendingReplacement(assetId: string) {
  pendingReplacement = {
    assetId,
    nodeId: "node-a",
    sourceUrl: "/static/source.png",
    label: "画布节点",
    directorControlBundle: { schema_version: "director_control_bundle_v1" },
  };
}

function useController(onReplaced: AssetLibraryReplacementHandler) {
  return useAssetLibraryReplacementController({
    project: "demo",
    onReplaced,
    store: {
      activeDragMediaType: "image",
      hoverAssetId: "asset-a",
      pendingReplacement,
      readPendingReplacement: () => pendingReplacement,
      clearPendingReplacement,
    },
  });
}

describe("asset library replacement controller", () => {
  beforeEach(() => {
    pendingReplacement = null;
    clearPendingReplacement.mockClear();
    mocks.commitDirectorRenderFromCanvasSource.mockReset().mockResolvedValue({
      target_path: "renders/ep001/beat_02.png",
      target_url: "/static/director.png",
      backup: null,
    });
    mocks.promoteToAsset.mockReset().mockResolvedValue({
      target_path: "frames/ep001/beat_02.png",
      target_url: "/static/frame.png",
      backup: null,
    });
  });

  it("commits regular replacements and advances the reload token", async () => {
    const currentAsset = asset("当前帧", {
      kind: "frame",
      role: "current_frame",
      meta: { episode: 1, beat: 2 },
    });
    const onReplaced = vi.fn();
    setPendingReplacement(currentAsset.id);
    const { result } = renderHook(() => useController(onReplaced));

    act(() => result.current.confirmReplacement(currentAsset));

    await waitFor(() => expect(result.current.reloadToken).toBe(1));
    expect(mocks.promoteToAsset).toHaveBeenCalledWith(
      "demo",
      "/static/source.png",
      { kind: "frame", episode: 1, beat: 2 },
      { mark_stale: false },
    );
    expect(onReplaced).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { kind: "frame", episode: 1, beat: 2 },
      }),
      "已用画布节点替换「当前帧」",
    );
    expect(pendingReplacement).toBeNull();
  });

  it("commits director renders with the complete canvas source bundle", async () => {
    const currentAsset = asset("导演合成图", {
      kind: "director_render",
      role: "director_combined",
      meta: { episode: 3, beat: 4 },
    });
    const onReplaced = vi.fn();
    setPendingReplacement(currentAsset.id);
    const { result } = renderHook(() => useController(onReplaced));

    act(() => result.current.confirmReplacement(currentAsset));

    await waitFor(() => expect(result.current.reloadToken).toBe(1));
    expect(mocks.commitDirectorRenderFromCanvasSource).toHaveBeenCalledWith(
      "demo",
      { kind: "director_render", episode: 3, beat: 4 },
      {
        sourceUrl: "/static/source.png",
        bundle: { schema_version: "director_control_bundle_v1" },
        sourceNodeId: "node-a",
        label: "画布节点",
      },
    );
    expect(mocks.promoteToAsset).not.toHaveBeenCalled();
    expect(onReplaced).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { kind: "director_render", episode: 3, beat: 4 },
      }),
      "已提交到「导演合成图」",
    );
  });

  it("reports commit failures without advancing the reload token", async () => {
    const currentAsset = asset("当前帧", {
      kind: "frame",
      role: "current_frame",
      meta: { episode: 1, beat: 2 },
    });
    const onReplaced = vi.fn();
    mocks.promoteToAsset.mockRejectedValueOnce(new Error("network down"));
    setPendingReplacement(currentAsset.id);
    const { result } = renderHook(() => useController(onReplaced));

    act(() => result.current.confirmReplacement(currentAsset));

    await waitFor(() => expect(pendingReplacement).toBeNull());
    expect(result.current.reloadToken).toBe(0);
    expect(result.current.busyAssetId).toBeNull();
    expect(onReplaced).toHaveBeenCalledWith(
      null,
      "替换「当前帧」失败：network down",
    );
  });

  it("reports an unresolvable target and clears the pending replacement", () => {
    const currentAsset = asset("未知资产", {
      kind: "unknown",
      role: "unknown_role",
    });
    const onReplaced = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setPendingReplacement(currentAsset.id);
    const { result } = renderHook(() => useController(onReplaced));

    act(() => result.current.confirmReplacement(currentAsset));

    expect(onReplaced).toHaveBeenCalledWith(
      null,
      "无法识别「未知资产」的提交目标（kind=unknown / role=unknown_role）",
    );
    expect(mocks.promoteToAsset).not.toHaveBeenCalled();
    expect(mocks.commitDirectorRenderFromCanvasSource).not.toHaveBeenCalled();
    expect(pendingReplacement).toBeNull();
    warn.mockRestore();
  });
});
