// Copyright (c) 2026 AI anime
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  VideoAlbumDeck,
  VideoAlbumGallery,
  VideoAlbumToggleButton,
} from "./VideoAlbumControls";

describe("VideoAlbumControls", () => {
  it("caps the visible deck edges and routes expansion", () => {
    const onExpand = vi.fn();
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <VideoAlbumDeck totalSlots={6} onExpand={onExpand} />
      </div>,
    );

    const deckEdges = screen.getAllByTitle("展开画册");
    expect(deckEdges).toHaveLength(3);
    fireEvent.click(deckEdges[0]);
    expect(onExpand).toHaveBeenCalledOnce();
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("shows pending progress and routes the toggle command", () => {
    const onToggle = vi.fn();
    render(
      <VideoAlbumToggleButton
        totalSlots={4}
        completedCount={1}
        pendingTotal={4}
        pendingCount={3}
        expanded={false}
        onToggle={onToggle}
      />,
    );

    const toggle = screen.getByTitle("展开 4 条生成结果");
    expect(toggle).toHaveTextContent("1/4");
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("routes gallery actions and ignores selection after a drag", () => {
    const onSetMain = vi.fn();
    const onApply = vi.fn();
    const onDownload = vi.fn();
    render(
      <VideoAlbumGallery
        width={100}
        height={60}
        totalSlots={3}
        urls={["first.mp4", "second.mp4"]}
        mainVideoUrl="first.mp4"
        pendingCount={1}
        resolveUrl={(url) => `/resolved/${url}`}
        onSetMain={onSetMain}
        onApply={onApply}
        onDownload={onDownload}
      />,
    );

    expect(screen.getByText("画册 · 3 条")).toBeInTheDocument();
    expect(screen.getByText("主视频")).toBeInTheDocument();
    expect(screen.getByText("生成中…")).toBeInTheDocument();
    expect(document.querySelector("video")).toHaveAttribute(
      "src",
      "/resolved/first.mp4",
    );

    const cells = screen.getAllByTitle("点击设为主视频");
    const gallery = screen.getByText("画册 · 3 条").parentElement!;
    fireEvent.pointerDown(gallery, { clientX: 0, clientY: 0 });
    fireEvent.click(cells[1], { clientX: 10, clientY: 0 });
    expect(onSetMain).not.toHaveBeenCalled();

    fireEvent.pointerDown(gallery, { clientX: 0, clientY: 0 });
    fireEvent.click(cells[1], { clientX: 3, clientY: 0 });
    expect(onSetMain).toHaveBeenCalledWith("second.mp4");

    onSetMain.mockClear();
    fireEvent.click(
      within(cells[1]).getByTitle("把这条视频作为独立视频节点放到画布上"),
    );
    fireEvent.click(within(cells[1]).getByTitle("下载这条视频"));
    expect(onApply).toHaveBeenCalledWith("second.mp4");
    expect(onDownload).toHaveBeenCalledWith("second.mp4", 1);
    expect(onSetMain).not.toHaveBeenCalled();
  });
});
