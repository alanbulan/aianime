// Copyright (c) 2026 AI anime
import { getByUiTooltip } from "@/__tests__/helpers/ui-tooltip-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  VideoGeneratingState,
  VideoGenerationErrorState,
  VideoGenerationHistoryPreview,
  VideoLoadErrorOverlay,
  VideoMetadataLoadingOverlay,
  VideoUploadingState,
} from "./VideoNodeMediaStatus";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === "node.videoNode.uploading" ? "正在上传" : key,
  }),
}));

describe("VideoNodeMediaStatus", () => {
  it("shows the uploading state", () => {
    render(<VideoUploadingState />);

    expect(screen.getByText("正在上传")).toBeInTheDocument();
  });

  it("renders a non-bubbling history preview and routes close", () => {
    const onNodeClick = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <div onClick={onNodeClick}>
        <VideoGenerationHistoryPreview
          videoUrl="history.mp4"
          onClose={onClose}
        />
      </div>,
    );

    expect(container.querySelector("video")).toHaveAttribute(
      "src",
      "history.mp4",
    );
    fireEvent.click(container.querySelector("video")!);
    fireEvent.click(screen.getByRole("button", { name: "返回" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onNodeClick).not.toHaveBeenCalled();
  });

  it("renders the generation preview and progress overlay", () => {
    const { container } = render(
      <VideoGeneratingState
        previewImageUrl="preview.png"
        progress={0.1}
      />,
    );

    expect(container.querySelector("img")).toHaveAttribute("src", "preview.png");
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows generation diagnostics and routes regeneration", () => {
    const onNodeClick = vi.fn();
    const onRegenerate = vi.fn();
    render(
      <div onClick={onNodeClick}>
        <VideoGenerationErrorState
          error="provider rejected request"
          requestId="req-123"
          busy={false}
          disabled={false}
          onRegenerate={onRegenerate}
        />
      </div>,
    );

    expect(screen.getByText("provider rejected request")).toBeInTheDocument();
    expect(getByUiTooltip("req-123")).toHaveTextContent("req-123");
    fireEvent.click(screen.getByRole("button", { name: "重新生成" }));

    expect(onRegenerate).toHaveBeenCalledOnce();
    expect(onNodeClick).not.toHaveBeenCalled();
  });

  it("renders video load error and metadata loading overlays", () => {
    const { rerender } = render(<VideoLoadErrorOverlay />);

    expect(screen.getByText("视频加载失败")).toBeInTheDocument();

    rerender(<VideoMetadataLoadingOverlay />);
    expect(screen.queryByText("视频加载失败")).not.toBeInTheDocument();
  });
});
