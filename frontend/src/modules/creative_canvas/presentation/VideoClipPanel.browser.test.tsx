// Copyright (c) 2026 AI anime
import { page } from "vitest/browser";
import { afterEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import "@/index.css";

import { VideoClipPanel } from "./VideoClipPanel";
import { VideoUploadErrorOverlay } from "./VideoNodeMediaStatus";

afterEach(() => document.documentElement.classList.remove("dark"));

it.each(["light", "dark"])("keeps clip actions and upload retry visible in %s mode", async (theme) => {
  document.documentElement.classList.toggle("dark", theme === "dark");
  await page.viewport(680, 400);
  const onSubmit = vi.fn();
  const onUpload = vi.fn();
  const frame = document.createElement("canvas");
  frame.width = 160;
  frame.height = 90;
  const context = frame.getContext("2d")!;
  context.fillStyle = "steelblue";
  context.fillRect(0, 0, 160, 90);
  const screen = await render(
    <div className="bg-background p-6 text-foreground">
      <div style={{ width: 440 }} className="space-y-4">
        <VideoClipPanel videoUrl="/fixture.mp4" durationMs={5_000}
          clipStartMs={500} clipEndMs={4_000}
          captureFrameStrip={async () => [{ timeMs: 500, url: frame.toDataURL() }]}
          onChange={vi.fn()} onExit={vi.fn()} onSubmit={onSubmit}
          onRemoveSubtitles={vi.fn()} />
        <div className="relative h-36 rounded-lg bg-muted">
          <VideoUploadErrorOverlay error="上传连接中断，请重新选择视频后重试" onUpload={onUpload} />
        </div>
      </div>
    </div>,
  );
  await screen.getByRole("button", { name: "输出静音视频" }).click();
  await screen.getByRole("button", { name: "循环 2 次" }).click();
  await screen.getByRole("button", { name: "提交剪辑" }).click();
  expect(onSubmit).toHaveBeenCalledWith(500, 4_000, { muted: true, repeatCount: 2 });
  await screen.getByRole("button", { name: "重新选择视频" }).click();
  expect(onUpload).toHaveBeenCalledOnce();
  await expect.element(screen.getByRole("button", { name: "去字幕" })).toBeVisible();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(680);
  await page.screenshot({ path: `../../../../acceptance-logs/video-clip-${theme}.png` });
});
