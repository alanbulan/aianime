// Copyright (c) 2026 AI anime
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QiuQiuAvatar } from "@/modules/ai_assistant/presentation/QiuQiuAvatar";

describe("QiuQiuAvatar", () => {
  afterEach(() => {
    delete window.EmotionBall;
  });

  it("mounts the source runtime, updates emotion, and destroys the instance", async () => {
    const engine = {
      destroy: vi.fn(),
      setActive: vi.fn(),
      setEmotion: vi.fn(() => true),
    };
    const create = vi.fn(() => engine);
    window.EmotionBall = { create };

    const { container, rerender, unmount } = render(
      <QiuQiuAvatar emotionId="30" label="球球" />,
    );

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        eyeScale: 1.5,
        fallbackId: "02",
        idle: false,
        lite: true,
        shape: "blob",
      }),
    );
    expect(container.firstElementChild).toHaveAttribute("data-qiuqiu-emotion", "30");

    rerender(<QiuQiuAvatar emotionId="33" label="球球" />);
    expect(engine.setEmotion).toHaveBeenCalledWith("33");
    expect(container.firstElementChild).toHaveAttribute("data-qiuqiu-state", "任务完成");

    unmount();
    expect(engine.destroy).toHaveBeenCalledTimes(1);
  });
});
