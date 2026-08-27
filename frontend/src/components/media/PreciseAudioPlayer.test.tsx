// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PreciseAudioPlayer } from "@/components/media/PreciseAudioPlayer";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "common.audioPlayer.play": "播放音频",
        "common.audioPlayer.pause": "暂停音频",
        "common.audioPlayer.seek": "音频进度",
        "common.audioPlayer.mute": "静音",
        "common.audioPlayer.unmute": "取消静音",
      })[key] ?? key,
  }),
}));

describe("PreciseAudioPlayer", () => {
  it("隐藏浏览器原生控件并精确显示亚秒时长", () => {
    const onLoadedDuration = vi.fn();
    const { container } = render(
      <PreciseAudioPlayer
        src="/voice.wav"
        onLoadedDuration={onLoadedDuration}
      />,
    );
    const audio = container.querySelector("audio") as HTMLAudioElement;
    Object.defineProperty(audio, "duration", {
      configurable: true,
      value: 0.642,
    });

    fireEvent.loadedMetadata(audio);

    expect(audio).not.toHaveAttribute("controls");
    expect(container.querySelector('input[type="range"]')).toBeNull();
    expect(screen.getByText("0.000s / 0.642s")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "音频进度" })).toHaveAttribute(
      "aria-valuemax",
      "0.642",
    );
    expect(onLoadedDuration).toHaveBeenCalledWith(0.642);
  });
});
