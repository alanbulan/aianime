// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VideoUploadActionRail } from "./VideoUploadActionRail";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "node.videoNode.clickToUpload": "点击上传视频",
        "node.videoNode.upload": "上传",
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

describe("VideoUploadActionRail", () => {
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
});
