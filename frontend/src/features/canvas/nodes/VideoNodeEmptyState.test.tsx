// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  VideoNodeEmptyState,
  VideoUploadActionRail,
} from "./VideoNodeEmptyState";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "node.videoNode.clickToUpload": "点击上传视频",
        "node.videoNode.upload": "上传",
        "node.videoUpscale.placeholder": "等待上游视频",
      })[key] ?? key,
  }),
}));

vi.mock("@/features/canvas/ui/NodeSideActionRail", () => ({
  NODE_SIDE_ACTION_BUTTON_CLASS: "side-action",
  NODE_SIDE_ACTION_ICON_CLASS: "side-icon",
  NodeSideActionRail: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="side-action-rail">{children}</div>
  ),
}));

describe("VideoNodeEmptyState", () => {
  it("routes the upload command without bubbling to the node", () => {
    const onNodeClick = vi.fn();
    const onUpload = vi.fn();
    render(
      <div onClick={onNodeClick}>
        <VideoUploadActionRail
          nodeId="video-1"
          selected
          onUpload={onUpload}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "上传" }));

    expect(onUpload).toHaveBeenCalledOnce();
    expect(onNodeClick).not.toHaveBeenCalled();
  });

  it("offers both frame-source commands without upstream video", () => {
    const onNodeClick = vi.fn();
    const onSpawnFirstLastFrame = vi.fn();
    const onSpawnFirstFrame = vi.fn();
    render(
      <div onClick={onNodeClick}>
        <VideoNodeEmptyState
          isUpscaleNode={false}
          isConnected={false}
          hasUpstreamVideo={false}
          onSpawnFirstLastFrame={onSpawnFirstLastFrame}
          onSpawnFirstFrame={onSpawnFirstFrame}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "首尾帧生成视频" }));
    fireEvent.click(screen.getByRole("button", { name: "首帧生成视频" }));

    expect(onSpawnFirstLastFrame).toHaveBeenCalledOnce();
    expect(onSpawnFirstFrame).toHaveBeenCalledOnce();
    expect(onNodeClick).not.toHaveBeenCalled();
  });

  it("hides frame commands for connected or video-referenced nodes", () => {
    const props = {
      isUpscaleNode: false,
      isConnected: true,
      hasUpstreamVideo: false,
      onSpawnFirstLastFrame: vi.fn(),
      onSpawnFirstFrame: vi.fn(),
    };
    const { rerender } = render(<VideoNodeEmptyState {...props} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(
      <VideoNodeEmptyState
        {...props}
        isConnected={false}
        hasUpstreamVideo
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows only the upscale placeholder for upscale nodes", () => {
    render(
      <VideoNodeEmptyState
        isUpscaleNode
        isConnected={false}
        hasUpstreamVideo={false}
        onSpawnFirstLastFrame={vi.fn()}
        onSpawnFirstFrame={vi.fn()}
      />,
    );

    expect(screen.getByText("等待上游视频")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
