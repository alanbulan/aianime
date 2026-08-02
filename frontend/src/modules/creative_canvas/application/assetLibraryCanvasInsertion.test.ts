// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { DirectorWorldSourceDescriptor } from "@/modules/asset_world/public";
import type { LibraryAsset } from "../domain/assetLibraryModel";
import type { CanvasAssetDragPayload } from "../domain/assetDrag";

import {
  assetToDragPayload,
  insertAssetLibraryAsset,
  viewportCenteredPosition,
  type AssetLibraryCanvasInsertionPort,
} from "./assetLibraryCanvasInsertion";

function libraryAsset(
  overrides: Partial<LibraryAsset>,
): LibraryAsset {
  return {
    id: "asset-1",
    tab: "beat",
    kind: "frame",
    role: "current_frame",
    label: "分镜",
    url: "/static/project-1/frame.png",
    aspectRatio: "16:9",
    mediaType: "image",
    source: { role: "current_frame" },
    ...overrides,
  };
}

function insertionPort() {
  const added: Array<{
    payload: CanvasAssetDragPayload;
    position: { x: number; y: number };
  }> = [];
  const focused: string[] = [];
  const canvas: AssetLibraryCanvasInsertionPort = {
    canvasViewportSize: { width: 0, height: 0 },
    currentViewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    spawnAsset: (payload, position) => {
      added.push({ payload, position });
      return "node-1";
    },
    requestFocusNode: (nodeId) => focused.push(nodeId),
  };
  return { added, canvas, focused };
}

describe("assetLibraryCanvasInsertion", () => {
  it("projects aggregated Director World assets to model drag payloads", () => {
    const sources: DirectorWorldSourceDescriptor[] = [
      {
        id: "master",
        source_type: "sog",
        source_kind: "master",
        url: "/static/project-1/master.sog",
        ply_url: "/static/project-1/master.sog",
      },
      {
        id: "pano",
        source_type: "pano360",
        source_kind: "pano",
        url: "/static/project-1/pano.png",
        pano_url: "/static/project-1/pano.png",
        current: true,
      },
    ];
    const mainlineContext = [{
      kind: "scene" as const,
      projectId: "project-1",
      sceneId: "courtyard",
    }];
    const payload = assetToDragPayload(libraryAsset({
      tab: "scenes",
      kind: "director",
      role: "scene_director_world",
      label: "中庭 / 导演世界",
      url: "/static/project-1/pano.png",
      coverUrl: "/static/project-1/master.png",
      mediaType: "file",
      mainlineContext,
      source: {
        rel_path: "director_worlds/courtyard/pano.png",
        director_world_sources: sources,
        active_source_id: "pano",
      },
    }));

    expect(payload).toMatchObject({
      kind: "model",
      label: "中庭 / 导演世界",
      coverUrl: "/static/project-1/master.png",
      modelSources: sources,
      activeSourceId: "pano",
      plyUrl: null,
      panoUrl: "/static/project-1/pano.png",
      sourceFileName: "pano.png",
      mainlineContext,
    });
  });

  it("maps media payloads and rejects non-renderable library files", () => {
    expect(assetToDragPayload(libraryAsset({ mediaType: "video" }))).toMatchObject({
      kind: "video",
      aspectRatio: "16:9",
    });
    expect(assetToDragPayload(libraryAsset({ mediaType: "audio" }))).toMatchObject({
      kind: "audio",
    });
    expect(assetToDragPayload(libraryAsset({ mediaType: "image" }))).toMatchObject({
      kind: "image",
      aspectRatio: "16:9",
    });
    expect(assetToDragPayload(libraryAsset({ mediaType: "text" }))).toBeNull();
    expect(assetToDragPayload(libraryAsset({
      kind: "document",
      role: "reference",
      mediaType: "file",
    }))).toBeNull();
  });

  it("centers new nodes, avoids collisions, and preserves the fallback grid", () => {
    const state = {
      canvasViewportSize: { width: 800, height: 600 },
      currentViewport: { x: 0, y: 0, zoom: 2 },
      nodes: [],
    };

    expect(viewportCenteredPosition(state, 0, 200, 100)).toEqual({
      x: 64,
      y: 64,
    });
    expect(viewportCenteredPosition({
      ...state,
      nodes: [{
        position: { x: 64, y: 64 },
        measured: { width: 200, height: 100 },
      }],
    }, 0, 200, 100)).toEqual({
      x: 280,
      y: 64,
    });
    expect(viewportCenteredPosition({
      ...state,
      canvasViewportSize: { width: 0, height: 0 },
    }, 3, 200, 100)).toEqual({
      x: -492,
      y: 380,
    });
  });

  it("hydrates before spawning and falls back to the original payload on failure", async () => {
    const success = insertionPort();
    const nodeId = await insertAssetLibraryAsset({
      asset: libraryAsset({}),
      index: 0,
      nodeWidth: 320,
      canvas: success.canvas,
      hydratePayload: async (payload) => ({
        ...payload,
        label: "已补全分镜",
      }),
    });

    expect(nodeId).toBe("node-1");
    expect(success.added).toMatchObject([{
      payload: { kind: "image", label: "已补全分镜" },
      position: { x: -720, y: 120 },
    }]);
    expect(success.focused).toEqual(["node-1"]);

    const failure = insertionPort();
    const hydrationError = new Error("manifest unavailable");
    const onHydrationError = vi.fn();
    await insertAssetLibraryAsset({
      asset: libraryAsset({ mediaType: "video" }),
      index: 0,
      nodeWidth: 320,
      canvas: failure.canvas,
      hydratePayload: async () => Promise.reject(hydrationError),
      onHydrationError,
    });

    expect(onHydrationError).toHaveBeenCalledWith(hydrationError);
    expect(failure.added).toMatchObject([{
      payload: { kind: "video", label: "分镜" },
    }]);
    expect(failure.focused).toEqual(["node-1"]);
  });
});
