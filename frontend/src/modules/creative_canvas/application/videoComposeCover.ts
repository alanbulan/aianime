// Copyright (c) 2026 AI anime
import {
  activeClipAt,
  type ComposeTimelineState,
} from "../domain/videoComposeTimeline";

/**
 * 封面选帧的纯逻辑工具（无 React）。把时间线位置解析成可截帧的源地址与源内时间。
 */

export interface CoverFrameSource {
  sourceUrl: string;
  /** 该时间线时刻对应的源媒体内时间（ms，已含 trim/变速换算）。 */
  sourceMs: number;
}

/**
 * 在时间线某 ms 处，取「最上层命中」的视频片段的源地址与源内时间（与预览舞台同款
 * 取轨规则：数组靠后的视频轨在上层）。落在空隙 / 无视频时返回 null。
 */
export function coverFrameSourceAt(
  timeline: ComposeTimelineState,
  ms: number,
): CoverFrameSource | null {
  const videos = timeline.tracks.filter((track) => track.kind === "video");
  for (let i = videos.length - 1; i >= 0; i -= 1) {
    const active = activeClipAt(videos[i], ms);
    if (active) {
      return { sourceUrl: active.laid.clip.sourceUrl, sourceMs: active.sourceMs };
    }
  }
  return null;
}

/** 时间线是否含任意可截帧的视频片段（用于禁用「选帧」tab）。 */
export function hasCoverableVideo(timeline: ComposeTimelineState): boolean {
  return timeline.tracks.some(
    (track) => track.kind === "video" && track.clips.length > 0,
  );
}
