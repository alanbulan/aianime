// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import type { LibraryAsset } from "@/modules/creative_canvas/public";
import { AssetLibraryPanelView } from "./AssetLibraryPanelView";

vi.mock("./CanvasesTab", () => ({
  CanvasesTab: ({ project }: { project: string }) => (
    <div>canvases:{project}</div>
  ),
}));

vi.mock("./AssetLibraryBeatPanels", () => ({
  BeatContextPanel: ({ assets }: { assets: LibraryAsset[] }) => (
    <div>beat:{assets.map((asset) => asset.label).join(",")}</div>
  ),
}));

vi.mock("./AssetLibraryAssetCard", () => ({
  AssetLibraryAssetCard: ({
    asset,
    isConfirming,
    onAdd,
    onConfirm,
  }: {
    asset: LibraryAsset;
    isConfirming: boolean;
    onAdd: () => void;
    onConfirm: () => void;
  }) => (
    <div>
      card:{asset.label}:{isConfirming ? "confirming" : "idle"}
      <button type="button" onClick={onAdd}>add:{asset.label}</button>
      <button type="button" onClick={onConfirm}>confirm:{asset.label}</button>
    </div>
  ),
}));

function asset(
  id: string,
  overrides: Partial<LibraryAsset> = {},
): LibraryAsset {
  return {
    id,
    tab: "characters",
    kind: "identity",
    role: "character_portrait",
    label: id,
    url: `/static/${id}.png`,
    aspectRatio: "1:1",
    mediaType: "image",
    source: {},
    ...overrides,
  };
}

function props(
  overrides: Partial<ComponentProps<typeof AssetLibraryPanelView>> = {},
): ComponentProps<typeof AssetLibraryPanelView> {
  return {
    project: "demo",
    metadata: { kind: "default" },
    canvasKind: "default",
    catalog: {
      assets: [],
      beatContext: null,
      error: null,
      assetImageCacheToken: "cache-1",
    },
    replacement: {
      activeDragMediaType: null,
      hoverAssetId: null,
      confirmingAssetId: null,
      busyAssetId: null,
      confirmReplacement: vi.fn(),
      cancelReplacement: vi.fn(),
    },
    currentCanvasId: "canvas-a",
    hasPresetLabel: false,
    onAddAsset: vi.fn(),
    ...overrides,
  };
}

describe("AssetLibraryPanelView", () => {
  it("forwards controlled collapse changes and starts on the canvases tab", () => {
    const onCollapsedChange = vi.fn();
    render(
      <AssetLibraryPanelView
        {...props({ collapsed: true, onCollapsedChange })}
      />,
    );

    expect(screen.getByText("canvases:demo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开素材抽屉" }));
    expect(onCollapsedChange).toHaveBeenCalledWith(false);
  });

  it("switches library tabs and filters ordinary assets by search text", () => {
    const beat = asset("当前分镜", {
      tab: "beat",
      kind: "frame",
      role: "current_frame",
      source: { from_beat_context: true },
    });
    const character = asset("Alice");
    const scene = asset("Kitchen", {
      tab: "scenes",
      kind: "scene",
      role: "scene_master",
      sublabel: "Night Interior",
    });
    render(
      <AssetLibraryPanelView
        {...props({
          collapsed: false,
          catalog: {
            assets: [beat, character, scene],
            beatContext: null,
            error: null,
            assetImageCacheToken: "cache-1",
          },
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "主线资产" }));
    expect(screen.getByText("beat:当前分镜")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /场景/ }));
    expect(screen.getByText(/card:Kitchen:idle/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("搜索素材..."), {
      target: { value: "night" },
    });
    expect(screen.getByText(/card:Kitchen:idle/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("搜索素材..."), {
      target: { value: "missing" },
    });
    expect(screen.getByText("当前分类没有可用素材")).toBeInTheDocument();
  });

  it("wires ordinary card add and replacement commands", () => {
    const character = asset("Alice");
    const onAddAsset = vi.fn();
    const confirmReplacement = vi.fn();
    render(
      <AssetLibraryPanelView
        {...props({
          collapsed: false,
          catalog: {
            assets: [character],
            beatContext: null,
            error: null,
            assetImageCacheToken: "cache-1",
          },
          replacement: {
            activeDragMediaType: "image",
            hoverAssetId: character.id,
            confirmingAssetId: character.id,
            busyAssetId: null,
            confirmReplacement,
            cancelReplacement: vi.fn(),
          },
          onAddAsset,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "主线资产" }));
    fireEvent.click(screen.getByRole("button", { name: /人物/ }));
    expect(screen.getByText(/card:Alice:confirming/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "add:Alice" }));
    fireEvent.click(screen.getByRole("button", { name: "confirm:Alice" }));
    expect(onAddAsset).toHaveBeenCalledWith(character, 0);
    expect(confirmReplacement).toHaveBeenCalledWith(character);
  });
});
