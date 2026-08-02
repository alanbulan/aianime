// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BeatContextPanel } from "./AssetLibraryBeatPanels";
import type { FreezoneBeatContextResponse } from "../domain/beatContext";
import type { LibraryAsset } from "../domain/assetLibraryModel";

const cacheBustImage = (imageUrl: string) => imageUrl;

function libraryAsset(
  id: string,
  overrides: Partial<LibraryAsset>,
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
    source: {},
    ...overrides,
  };
}

describe("AssetLibraryBeatPanels", () => {
  it("renders the default episode hierarchy and preserves the global asset index", () => {
    const first = libraryAsset("第一镜", {
      source: { episode: 1, beat: 2 },
    });
    const second = libraryAsset("当前分镜", {
      source: { episode: 1, beat: 3 },
    });
    const beatContext: FreezoneBeatContextResponse = {
      scope: { episode: null, beat: null },
      episodes: [{
        episode: 1,
        beats: [
          { episode: 1, beat: 2, assets: [] },
          { episode: 1, beat: 3, assets: [] },
        ],
      }],
      assets: [],
    };
    const onAddAsset = vi.fn();

    render(
      <BeatContextPanel
        metadata={null}
        assets={[first, second]}
        canvasKind="default"
        beatContext={beatContext}
        cacheToken="cache-1"
        cacheBustImage={cacheBustImage}
        onAddAsset={onAddAsset}
      />,
    );

    expect(screen.getByText("第1集")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Beat 3/ }));
    fireEvent.click(screen.getByTitle("当前分镜"));
    expect(onAddAsset).toHaveBeenCalledWith(second, 1);
  });

  it("renders preset groups and forwards their local asset index", () => {
    const director = libraryAsset("导演合成图", {
      kind: "director",
      role: "director_combined",
    });
    const onAddAsset = vi.fn();

    render(
      <BeatContextPanel
        metadata={{ preset: { episode: 2, beat: 5 } }}
        assets={[director]}
        canvasKind="beat"
        beatContext={null}
        cacheToken="cache-2"
        cacheBustImage={cacheBustImage}
        onAddAsset={onAddAsset}
      />,
    );

    expect(screen.getByText("第2集")).toBeInTheDocument();
    expect(screen.getByText("Beat 5")).toBeInTheDocument();
    expect(screen.getByText("3GS / 控制图")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("导演合成图"));
    expect(onAddAsset).toHaveBeenCalledWith(director, 0);
  });

  it("shows the no-context state for asset canvases", () => {
    render(
      <BeatContextPanel
        metadata={null}
        assets={[]}
        canvasKind="asset"
        beatContext={null}
        cacheToken="cache-3"
        cacheBustImage={cacheBustImage}
        onAddAsset={vi.fn()}
      />,
    );

    expect(screen.getByText("当前画布没有镜头上下文")).toBeInTheDocument();
  });
});
