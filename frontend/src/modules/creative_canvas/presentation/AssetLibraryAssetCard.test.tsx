// Copyright (c) 2026 AI anime
import { getByUiTooltip } from "@/__tests__/helpers/ui-tooltip-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  CANVAS_ASSET_DRAG_MIME,
} from "../domain/assetDrag";
import type { LibraryAsset } from "../domain/assetLibraryModel";
import { AssetLibraryAssetCard } from "./AssetLibraryAssetCard";

const cacheBustImage = (imageUrl: string) => imageUrl;

function asset(
  id: string,
  overrides: Partial<LibraryAsset> = {},
): LibraryAsset {
  return {
    id,
    tab: "characters",
    kind: "frame",
    role: "current_frame",
    label: id,
    url: `/static/${id}.png`,
    aspectRatio: "16:9",
    mediaType: "image",
    source: {
      kind: "frame",
      role: "current_frame",
      meta: { episode: 1, beat: 2 },
    },
    ...overrides,
  };
}

function renderCard(
  currentAsset: LibraryAsset,
  overrides: Partial<ComponentProps<typeof AssetLibraryAssetCard>> = {},
) {
  return render(
    <AssetLibraryAssetCard
      asset={currentAsset}
      index={0}
      cacheToken="cache-1"
      cacheBustImage={cacheBustImage}
      onAdd={vi.fn()}
      activeDragMediaType={null}
      hoverAssetId={null}
      isConfirming={false}
      isReplacing={false}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      {...overrides}
    />,
  );
}

describe("AssetLibraryAssetCard", () => {
  it("uses the small project-media variant for card artwork", () => {
    renderCard(
      asset("缩略图", {
        url: "/static/projects/project-a/images/portrait.png?v=7",
      }),
    );

    expect(screen.getByAltText("缩略图")).toHaveAttribute(
      "src",
      "/static/projects/project-a/images/portrait.png?v=7&st_thumb=thumb",
    );
  });

  it("renders an asset and adds it once from the explicit action", () => {
    const onAdd = vi.fn();
    renderCard(asset("角色立绘"), { onAdd });

    expect(screen.getByAltText("角色立绘")).toBeInTheDocument();
    fireEvent.click(getByUiTooltip("加入画布"));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("only exposes director render replacement targets for image drags", () => {
    const director = asset("导演合成图", {
      kind: "director",
      role: "director_combined",
      source: {
        kind: "director_render",
        role: "director_combined",
        meta: { episode: 3, beat: 4 },
      },
    });
    const { container, rerender } = renderCard(director, {
      activeDragMediaType: "video",
    });

    expect(container.firstElementChild).not.toHaveAttribute("data-asset-id");
    rerender(
      <AssetLibraryAssetCard
        asset={director}
        index={0}
        cacheToken="cache-1"
        cacheBustImage={cacheBustImage}
        onAdd={vi.fn()}
        activeDragMediaType="image"
        hoverAssetId={director.id}
        isConfirming={false}
        isReplacing={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.firstElementChild).toHaveAttribute(
      "data-asset-id",
      director.id,
    );
    expect(container.firstElementChild).toHaveAttribute(
      "data-asset-media-type",
      "image",
    );
    expect(container.firstElementChild).toHaveClass("opacity-70");
  });

  it("forwards replacement confirmation and cancellation commands", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderCard(asset("当前帧"), {
      isConfirming: true,
      onConfirm,
      onCancel,
    });

    expect(screen.getByText("用画布节点替换「当前帧」？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "替换" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("serializes the canvas drag payload and removes its custom preview", () => {
    vi.useFakeTimers();
    try {
      const currentAsset = asset("当前帧");
      const dataTransfer = {
        effectAllowed: "none",
        setData: vi.fn(),
        setDragImage: vi.fn(),
      };
      const { container } = renderCard(currentAsset);

      fireEvent.dragStart(container.firstElementChild as HTMLElement, {
        dataTransfer,
      });

      expect(dataTransfer.setData).toHaveBeenCalledWith(
        CANVAS_ASSET_DRAG_MIME,
        expect.any(String),
      );
      const payload = JSON.parse(dataTransfer.setData.mock.calls[0][1]);
      expect(payload).toMatchObject({
        kind: "image",
        label: currentAsset.label,
        url: currentAsset.url,
      });
      expect(dataTransfer.effectAllowed).toBe("copy");
      expect(dataTransfer.setDragImage).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        24,
        24,
      );
      const preview = dataTransfer.setDragImage.mock.calls[0][0] as HTMLElement;
      expect(document.body.contains(preview)).toBe(true);
      act(() => vi.runAllTimers());
      expect(document.body.contains(preview)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
