// Copyright (c) 2026 AI anime
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { VideoPaneMediaController } from "@/modules/production/application/use-video-pane-media-controller";
import { VideoPaneMediaView } from "@/modules/production/presentation/VideoPaneMediaView";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/modules/production/presentation/VideoPaneParts", () => ({
  BeatVideoPlayer: () => <div>视频播放器</div>,
  VideoReferenceMediaPreview: () => <div>视频播放器</div>,
}));

describe("VideoPaneMediaView", () => {
  it("把历史版本时间明确标成距生成时间而非视频时长", () => {
    const controller: VideoPaneMediaController = {
      beatNumber: 5,
      candidateCount: 1,
      candidates: [
        {
          active: true,
          id: "candidate-1",
          modelLabel: "Video Model Reference",
          modelTooltip: "video-model-reference",
          previewSource: null,
          timeLabel: "6小时前",
          timeTooltip: "生成于 6.9小时前",
        },
      ],
      deletePending: false,
      downloadUrl: null,
      hasGeneratedVideo: true,
      previewSource: "/beat-5.mp4",
      selectionPending: false,
      state: "ready",
      useVideoReferencePreview: false,
      videoActive: false,
      videoPercent: 100,
      deleteCandidate: vi.fn(async () => undefined),
      selectCandidate: vi.fn(async () => undefined),
    };

    render(<VideoPaneMediaView controller={controller} frameAspectCss="2 / 3" />);

    expect(screen.getByText("6小时前")).toHaveAttribute(
      "data-ui-tooltip",
      "生成于 6.9小时前",
    );
    expect(screen.queryByText("6.9h")).not.toBeInTheDocument();
  });

  it("只给非当前版本提供删除按钮，并确认后删除指定候选", async () => {
    const deleteCandidate = vi.fn(async () => undefined);
    const controller: VideoPaneMediaController = {
      beatNumber: 5,
      candidateCount: 2,
      candidates: [
        {
          active: true,
          id: "active",
          modelLabel: "Video Model Reference",
          modelTooltip: "provider-a:video-model-reference",
          previewSource: null,
          timeLabel: null,
          timeTooltip: null,
        },
        {
          active: false,
          id: "inactive",
          modelLabel: "very-long-video-model-source-id",
          modelTooltip: "gateway:very-long-video-model-source-id",
          previewSource: null,
          timeLabel: "2小时前",
          timeTooltip: "生成于 2.1小时前",
        },
      ],
      deletePending: false,
      downloadUrl: null,
      hasGeneratedVideo: true,
      previewSource: null,
      selectionPending: false,
      state: "ready",
      useVideoReferencePreview: false,
      videoActive: false,
      videoPercent: 100,
      deleteCandidate,
      selectCandidate: vi.fn(async () => undefined),
    };

    render(<VideoPaneMediaView controller={controller} frameAspectCss="2 / 3" />);

    const modelLabel = screen.getByText("very-long-video-model-source-id");
    expect(modelLabel).toHaveClass("truncate", "whitespace-nowrap");
    expect(
      screen.getAllByRole("button", {
        name: "episode.workbench.media.deleteCandidate",
      }),
    ).toHaveLength(1);

    fireEvent.click(
      screen.getByRole("button", {
        name: "episode.workbench.media.deleteCandidate",
      }),
    );
    expect(
      screen.getByText("episode.workbench.media.deleteTitle"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "common.delete" }));

    await waitFor(() => expect(deleteCandidate).toHaveBeenCalledWith("inactive"));
  });
});
