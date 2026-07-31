// Copyright (c) 2026 AI anime
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCommitDialogTargetController } from "./useCommitDialogTargetController";

const mocks = vi.hoisted(() => ({
  listCharacters: vi.fn(),
  listCharacterIdentities: vi.fn(),
  listScenes: vi.fn(),
  listEpisodes: vi.fn(),
  listBeats: vi.fn(),
  previewAssetImpact: vi.fn(),
}));

vi.mock("@/modules/asset_world/public", () => ({
  clearSceneDirectorWorld: vi.fn(),
  directorSourceIdentityUrl: (url: string) => url,
  loadSceneDirectorStageManifest: vi.fn(),
  saveSceneDirectorWorld: vi.fn(),
  saveSceneDirectorWorldSource: vi.fn(),
  listCharacters: (...args: unknown[]) => mocks.listCharacters(...args),
  listCharacterIdentities: (...args: unknown[]) =>
    mocks.listCharacterIdentities(...args),
  listScenes: (...args: unknown[]) => mocks.listScenes(...args),
}));

vi.mock("@/modules/narrative_planning/public", () => ({
  listEpisodes: (...args: unknown[]) => mocks.listEpisodes(...args),
  listBeats: (...args: unknown[]) => mocks.listBeats(...args),
}));

vi.mock("../composition", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../composition")>()),
  getFreezoneAssetImpact: (...args: unknown[]) =>
    mocks.previewAssetImpact(...args),
}));

describe("commit dialog target controller", () => {
  beforeEach(() => {
    mocks.listCharacters.mockReset().mockResolvedValue([
      {
        name: "Alice",
        display_name: "Alice",
        identities: [
          {
            id: "identity-a",
            identity_id: "identity-a",
            identity_name: "身份 A",
          },
        ],
      },
    ]);
    mocks.listCharacterIdentities.mockReset().mockResolvedValue([]);
    mocks.listScenes.mockReset().mockResolvedValue([
      { name: "公寓楼电梯间" },
    ]);
    mocks.listEpisodes.mockReset().mockResolvedValue([
      { number: 1, title: "第一集" },
    ]);
    mocks.listBeats.mockReset().mockResolvedValue([
      { beat_number: 2 },
      { beat_index: 0 },
      { beat_number: 2 },
    ]);
    mocks.previewAssetImpact.mockReset().mockResolvedValue({
      affected_beats: [],
    });
  });

  it("loads catalogs and selects canonical initial target values", async () => {
    const { result } = renderHook(() =>
      useCommitDialogTargetController({
        project: "demo",
        sourceUrl: "/static/source.png",
        mediaType: "image",
        defaultTarget: { kind: "identity" },
      }),
    );

    await waitFor(() => {
      expect(result.current.episode).toBe(1);
      expect(result.current.beat).toBe(2);
      expect(result.current.sceneId).toBe("公寓楼电梯间");
      expect(result.current.character).toBe("Alice");
      expect(result.current.identityId).toBe("identity-a");
    });

    expect(result.current.beatOptions).toEqual([2, 1]);
    expect(result.current.displayedIdentityOptions).toHaveLength(1);
    expect(result.current.target).toEqual({
      kind: "identity",
      character: "Alice",
      identity_id: "identity-a",
    });
  });

  it("refreshes Beat options when the selected episode changes", async () => {
    mocks.listBeats.mockImplementation(
      (_project: string, episode: number) =>
        Promise.resolve(
          episode === 2
            ? [{ beat_index: 0 }, { beat_index: 1 }]
            : [{ beat_number: 2 }],
        ),
    );
    const { result } = renderHook(() =>
      useCommitDialogTargetController({
        project: "demo",
        sourceUrl: "/static/source.png",
        mediaType: "image",
        defaultTarget: { kind: "frame" },
      }),
    );
    await waitFor(() => expect(result.current.beatOptions).toEqual([2]));

    act(() => result.current.setEpisode(2));

    await waitFor(() => expect(result.current.beatOptions).toEqual([1]));
    expect(result.current.beat).toBe(1);
    expect(mocks.listBeats).toHaveBeenLastCalledWith("demo", 2);
  });

  it("previews impact for a complete global target", async () => {
    mocks.previewAssetImpact.mockResolvedValue({
      affected_beats: [{ episode: 1, beat: 3 }],
    });
    const { result } = renderHook(() =>
      useCommitDialogTargetController({
        project: "demo",
        sourceUrl: "/static/source.png",
        mediaType: "image",
        defaultTarget: {
          kind: "scene_master",
          scene_id: "公寓楼电梯间",
        },
      }),
    );

    await waitFor(() =>
      expect(result.current.impactBeats).toEqual([
        { episode: 1, beat: 3 },
      ]),
    );
    expect(mocks.previewAssetImpact).toHaveBeenCalledWith("demo", {
      kind: "scene_master",
      scene_id: "公寓楼电梯间",
    });
    expect(result.current.targetLabel).toBe("公寓楼电梯间 / 场景主图");
    expect(result.current.markStale).toBe(true);
  });

  it("normalizes primary catalog loading failures", async () => {
    mocks.listCharacters.mockRejectedValueOnce(new Error("network down"));
    const { result } = renderHook(() =>
      useCommitDialogTargetController({
        project: "demo",
        sourceUrl: "/static/source.png",
        mediaType: "image",
      }),
    );

    await waitFor(() => expect(result.current.error).toBe("network down"));
    expect(result.current.scenes).toEqual([{ name: "公寓楼电梯间" }]);
  });
});
