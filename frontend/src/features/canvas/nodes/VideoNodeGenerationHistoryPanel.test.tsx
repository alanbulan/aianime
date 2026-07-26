// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  VideoNodeGenerationHistoryPanel,
  type VideoNodeGenerationHistoryPanelProps,
} from "./VideoNodeGenerationHistoryPanel";

type HistoryRecord = VideoNodeGenerationHistoryPanelProps["records"][number];

function historyRecord(overrides: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    schema_version: 1,
    canvas_id: "canvas-1",
    node_id: "video-1",
    recorded_at: "2026-07-26T00:00:00.000Z",
    id: "history-1",
    task_type: "video.generate",
    task_key: "task-1",
    job_id: "job-1",
    status: "completed",
    media_type: "video",
    result: { video_url: "history.mp4" },
    ...overrides,
  };
}

const baseProps: VideoNodeGenerationHistoryPanelProps = {
  visible: true,
  records: [historyRecord()],
  isLoading: false,
  activeOutputUrl: "history.mp4",
  topOffsetPx: 304,
  horizontalOverhangPx: 120,
  onRestore: vi.fn(),
  onRefresh: vi.fn(),
};

describe("VideoNodeGenerationHistoryPanel", () => {
  it("hides when the host is unavailable or no completed record exists", () => {
    const { container, rerender } = render(
      <VideoNodeGenerationHistoryPanel {...baseProps} visible={false} />,
    );

    expect(container).toBeEmptyDOMElement();

    rerender(
      <VideoNodeGenerationHistoryPanel
        {...baseProps}
        records={[historyRecord({ status: "failed" })]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("positions the completed history and marks the active output", () => {
    const { container } = render(
      <VideoNodeGenerationHistoryPanel {...baseProps} />,
    );

    expect(screen.getByText("历史记录 · 1")).toBeInTheDocument();
    expect(container.querySelector(".absolute")).toHaveStyle({
      top: "calc(100% + 304px)",
      left: "-120px",
      right: "-120px",
    });
    expect(
      container.querySelector('button[aria-pressed="true"]'),
    ).toBeInTheDocument();
  });

  it("routes restore and refresh without bubbling to the node", () => {
    const onNodeClick = vi.fn();
    const onRefresh = vi.fn();
    const onRestore = vi.fn();
    const { container } = render(
      <div onClick={onNodeClick}>
        <VideoNodeGenerationHistoryPanel
          {...baseProps}
          onRefresh={onRefresh}
          onRestore={onRestore}
        />
      </div>,
    );

    fireEvent.click(container.querySelector('button[aria-pressed="true"]')!);
    fireEvent.click(screen.getByTitle("刷新历史"));

    expect(onRestore).toHaveBeenCalledWith(baseProps.records[0]);
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onNodeClick).not.toHaveBeenCalled();
  });
});
