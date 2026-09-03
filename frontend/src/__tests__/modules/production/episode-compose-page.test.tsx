// Copyright (c) 2026 AI anime
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { EpisodeComposePageController } from "@/modules/production/application/use-episode-compose-page-controller";
import { EpisodeComposePageView } from "@/modules/production/presentation/EpisodeComposePageView";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/media/UnifiedVideoPlayer", () => ({
  UnifiedVideoPlayer: ({ src }: { src: string }) => <video src={src} />,
}));

describe("episode compose settings", () => {
  it("keeps frame and subtitle controls available for an existing final video", async () => {
    const handleResolutionChange = vi.fn();
    const handleAddSubtitlesChange = vi.fn();
    const handleAddBgmChange = vi.fn();
    const controller = {
      addBgm: true,
      addSubtitles: false,
      beatsEmpty: false,
      beatsLoading: false,
      canCompose: true,
      composeConfirm: false,
      counts: { compose: { missing: [], ready: true } },
      displayTitle: "第一集",
      durationLabel: "0:05",
      handleAddBgmChange,
      handleAddSubtitlesChange,
      handleCompose: vi.fn(),
      handleDownloadVideo: vi.fn(),
      handleExport: vi.fn(),
      handleResolutionChange,
      isComposing: false,
      onOpenBeat: vi.fn(),
      outputFilename: "ep001_final.mp4",
      resolution: "1920x1080",
      resultUrl: "/static/ep001_final.mp4",
      setComposeConfirm: vi.fn(),
      task: { logs: [], stream: {} },
      totalBeats: 1,
    } as unknown as EpisodeComposePageController;
    const user = userEvent.setup();
    render(<EpisodeComposePageView controller={controller} />);

    await user.click(screen.getByRole("checkbox", { name: "video.addSubtitles" }));
    expect(handleAddSubtitlesChange).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("checkbox", { name: "video.addBgm" }));
    expect(handleAddBgmChange).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("combobox", { name: "episode.compose.resolution" }));
    expect(await screen.findAllByRole("option")).toHaveLength(4);
    await user.click(screen.getByRole("option", { name: "1080p · 9:16 (1080×1920)" }));
    expect(handleResolutionChange).toHaveBeenCalledWith("1080x1920", expect.anything());
  });
});
