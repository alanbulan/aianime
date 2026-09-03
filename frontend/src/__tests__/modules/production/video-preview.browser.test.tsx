// Copyright (c) 2026 AI anime
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import "@/index.css";
import { UnifiedVideoPlayer } from "@/components/media/UnifiedVideoPlayer";
import type { EpisodeComposePageController } from "@/modules/production/application/use-episode-compose-page-controller";
import type { VideoPaneMediaController } from "@/modules/production/application/use-video-pane-media-controller";
import { EpisodeComposePageView } from "@/modules/production/presentation/EpisodeComposePageView";
import { VideoPaneMediaView } from "@/modules/production/presentation/VideoPaneMediaView";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const sources: string[] = [];
const sizes = [
  { width: 720, height: 1280 },
  { width: 1280, height: 720 },
  { width: 834, height: 1112 },
];

async function createVideo(width: number, height: number): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "blue";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "red";
  context.fillRect(0, 0, width, 20);
  context.fillStyle = "lime";
  context.fillRect(0, height - 20, width, 20);
  const stream = canvas.captureStream(10);
  const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
  const chunks: BlobPart[] = [];
  const recorded = new Promise<Blob>((resolve) => {
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
  });
  recorder.start();
  await new Promise((resolve) => setTimeout(resolve, 200));
  recorder.stop();
  const blob = await recorded;
  stream.getTracks().forEach((track) => track.stop());
  return URL.createObjectURL(blob);
}

beforeAll(async () => {
  for (const size of sizes) sources.push(await createVideo(size.width, size.height));
});

afterAll(() => sources.forEach((source) => URL.revokeObjectURL(source)));

function composeController(src: string): EpisodeComposePageController {
  return {
    addBgm: false,
    addSubtitles: true,
    beatsEmpty: false,
    beatsLoading: false,
    canCompose: true,
    composeConfirm: false,
    counts: { compose: { missing: [], ready: true } },
    displayTitle: "第一集",
    durationLabel: "0:05",
    handleAddBgmChange: vi.fn(),
    handleAddSubtitlesChange: vi.fn(),
    handleCompose: vi.fn(),
    handleDownloadVideo: vi.fn(),
    handleExport: vi.fn(),
    handleResolutionChange: vi.fn(),
    isComposing: false,
    onOpenBeat: vi.fn(),
    outputFilename: "ep001_final.mp4",
    resolution: "1280x720",
    resultUrl: src,
    setComposeConfirm: vi.fn(),
    task: { logs: [], stream: {} },
    totalBeats: 1,
  } as unknown as EpisodeComposePageController;
}

function expectFittedFrame(video: HTMLVideoElement) {
  const frame = video.parentElement!.getBoundingClientRect();
  const viewport = video.parentElement!.parentElement!.getBoundingClientRect();
  const picture = video.getBoundingClientRect();
  expect(frame.width / frame.height).toBeCloseTo(video.videoWidth / video.videoHeight, 2);
  expect(picture.width / picture.height).toBeCloseTo(video.videoWidth / video.videoHeight, 2);
  expect(frame.width).toBeGreaterThan(0);
  expect(frame.height).toBeGreaterThan(0);
  expect(frame.left).toBeGreaterThanOrEqual(viewport.left - 1);
  expect(frame.right).toBeLessThanOrEqual(viewport.right + 1);
  expect(frame.top).toBeGreaterThanOrEqual(viewport.top - 1);
  expect(frame.bottom).toBeLessThanOrEqual(viewport.bottom + 1);
  expect((frame.left + frame.right) / 2).toBeCloseTo((viewport.left + viewport.right) / 2, 0);
  expect((frame.top + frame.bottom) / 2).toBeCloseTo((viewport.top + viewport.bottom) / 2, 0);
  expect(picture.top).toBeGreaterThanOrEqual(frame.top - 1);
  expect(picture.bottom).toBeLessThanOrEqual(frame.bottom + 1);
}

describe("视频预览实际画幅", () => {
  it.each([214, 180, 160])("宽度 %s 的竖屏播放器控制按钮保持同一行且不溢出", async (width) => {
    const screen = await render(
      <div style={{ width }}>
        <UnifiedVideoPlayer src={sources[0]} compact className="aspect-[9/16] w-full" />
      </div>,
    );
    const video = document.querySelector("video")!;
    await expect.poll(() => video.videoWidth).toBe(720);
    Object.defineProperties(video, {
      duration: { configurable: true, value: 234.5 },
      currentTime: { configurable: true, value: 11.9 },
    });
    video.dispatchEvent(new Event("durationchange"));
    video.dispatchEvent(new Event("timeupdate"));
    await expect.element(screen.getByText("0:11.90 / 3:54.50")).toBeVisible();

    const fullscreen = screen.getByRole("button", { name: "common.videoPlayer.fullscreen" }).element();
    const controls = Array.from(fullscreen.parentElement!.querySelectorAll("button"));
    const frame = video.parentElement!.getBoundingClientRect();
    const first = controls[0].getBoundingClientRect();
    expect(controls).toHaveLength(3);
    for (const control of controls) {
      const bounds = control.getBoundingClientRect();
      expect(bounds.top).toBeCloseTo(first.top, 1);
      expect(bounds.left).toBeGreaterThanOrEqual(frame.left);
      expect(bounds.right).toBeLessThanOrEqual(frame.right);
      expect(bounds.bottom).toBeLessThanOrEqual(frame.bottom);
      expect(bounds.width).toBeGreaterThanOrEqual(24);
    }
  });

  it.each(sizes.map((size, index) => ({ ...size, index })))(
    "成片 $width × $height 在窗口缩放后仍完整居中显示",
    async ({ width, height, index }) => {
      const screen = await render(
        <div style={{ width: 960, height: 640 }}>
          <EpisodeComposePageView controller={composeController(sources[index])} />
        </div>,
      );
      const video = document.querySelector("video")!;
      await expect.poll(() => video.videoWidth).toBe(width);
      await expect.poll(() => video.videoHeight).toBe(height);
      await expect.poll(() => video.parentElement!.getBoundingClientRect().width /
        video.parentElement!.getBoundingClientRect().height).toBeCloseTo(width / height, 2);
      expectFittedFrame(video);

      await screen.rerender(
        <div style={{ width: 700, height: 490 }}>
          <EpisodeComposePageView controller={composeController(sources[index])} />
        </div>,
      );
      expectFittedFrame(document.querySelector("video")!);
    },
  );

  it("更换成片后重新读取尺寸，不沿用上一版画幅", async () => {
    const screen = await render(
      <div style={{ width: 960, height: 640 }}>
        <EpisodeComposePageView controller={composeController(sources[0])} />
      </div>,
    );
    await expect.element(screen.getByText("720 × 1280")).toBeVisible();
    await screen.rerender(
      <div style={{ width: 960, height: 640 }}>
        <EpisodeComposePageView controller={composeController(sources[1])} />
      </div>,
    );
    await expect.element(screen.getByText("1280 × 720")).toBeVisible();
    await expect.element(screen.getByText("720 × 1280")).not.toBeInTheDocument();
    expectFittedFrame(document.querySelector("video")!);
  });

  it.each([false, true])("分镜预览和版本缩略图独立适配比例（参考模式 %s）", async (referenceMode) => {
    const controller = {
      previewSource: sources[2],
      state: "ready",
      beatNumber: 4,
      useVideoReferencePreview: referenceMode,
      videoActive: false,
      selectionPending: false,
      deletePending: false,
      candidates: sources.map((src, index) => ({
        id: String(index),
        active: index === 2,
        previewSource: src,
        modelLabel: `模型 ${index}`,
      })),
      selectCandidate: vi.fn(),
      deleteCandidate: vi.fn(),
    } as unknown as VideoPaneMediaController;
    const screen = await render(
      <div style={{ display: "grid", gridTemplateColumns: "auto minmax(260px,1fr)", width: 960 }}>
        <VideoPaneMediaView controller={controller} frameAspectCss="16 / 9" />
      </div>,
    );
    const videos = Array.from(document.querySelectorAll("video"));
    await expect.poll(() => videos[0].videoWidth).toBe(834);
    const mainFrame = videos[0].parentElement!.parentElement!;
    await expect.poll(() => mainFrame.clientWidth / mainFrame.clientHeight).toBeCloseTo(834 / 1112, 2);
    for (const [index, size] of sizes.entries()) {
      const thumbnail = videos[index + 1];
      await expect.poll(() => thumbnail.videoWidth).toBe(size.width);
      const frame = thumbnail.parentElement!;
      expect(frame.clientWidth / frame.clientHeight).toBeCloseTo(size.width / size.height, 2);
    }
    await screen.rerender(
      <div style={{ display: "grid", gridTemplateColumns: "auto minmax(260px,1fr)", width: 960 }}>
        <VideoPaneMediaView
          controller={{ ...controller, previewSource: sources[0] }}
          frameAspectCss="16 / 9"
        />
      </div>,
    );
    const updatedVideo = document.querySelector("video")!;
    await expect.poll(() => updatedVideo.videoWidth).toBe(720);
    await expect.poll(() => mainFrame.getBoundingClientRect().width /
      mainFrame.getBoundingClientRect().height).toBeCloseTo(720 / 1280, 2);
    const bounds = mainFrame.getBoundingClientRect();
    for (const control of mainFrame.querySelectorAll("button")) {
      const controlBounds = control.getBoundingClientRect();
      expect(controlBounds.left).toBeGreaterThanOrEqual(bounds.left);
      expect(controlBounds.right).toBeLessThanOrEqual(bounds.right);
    }
  });
});
