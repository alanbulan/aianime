// Copyright (c) 2026 AI anime
import { resolveImageDisplayUrl } from "@/features/canvas/application/imageData";
import type { VideoFrameStripFrame } from "@/features/canvas/application/videoFrameStrip";
import { captureBrowserVideoFrameStrip } from "@/features/canvas/infrastructure/browserVideoFrameStrip";

/**
 * 视频「胶片条」抽帧 —— 给时间线片段铺满采样帧（libtv 风格）。
 *
 * 每个源视频只抽一次帧并按 url 缓存：抽帧覆盖整段源时长，渲染时按片段的裁剪
 * 窗口（trimStart..trimEnd）挑最近帧平铺。这样拖 trim 手柄只是换显示的帧、
 * 不重新抽帧，开销极低。可请求 URL 统一以 crossOrigin='anonymous' 加载，避免
 * 跨域媒体污染 canvas；data/blob 媒体跳过该属性。浏览器媒体处理统一由共享帧条
 * 基础设施适配器负责。
 */
export type FilmstripFrame = VideoFrameStripFrame;

const cache = new Map<string, Promise<FilmstripFrame[]>>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Get (and cache) the filmstrip frames for a source video. */
export function getFilmstrip(sourceUrl: string): Promise<FilmstripFrame[]> {
  const resolved = resolveImageDisplayUrl(sourceUrl);
  if (!resolved) return Promise.resolve([]);
  const cached = cache.get(resolved);
  if (cached) return cached;
  const pending = captureBrowserVideoFrameStrip(resolved, {
    count: (duration) => clamp(Math.round(duration), 6, 40),
    targetWidth: 120,
  }).catch((error) => {
    cache.delete(resolved);
    throw error;
  });
  cache.set(resolved, pending);
  return pending;
}

/** Pick the captured frame closest to a given source time (ms). */
export function pickFrame(
  frames: FilmstripFrame[],
  timeMs: number,
): FilmstripFrame | null {
  if (frames.length === 0) return null;
  let best = frames[0];
  let bestDelta = Math.abs(frames[0].timeMs - timeMs);
  for (const frame of frames) {
    const delta = Math.abs(frame.timeMs - timeMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = frame;
    }
  }
  return best;
}
