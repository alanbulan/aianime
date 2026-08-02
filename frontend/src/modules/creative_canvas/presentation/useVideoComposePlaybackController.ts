// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  projectVideoComposeActiveMediaClock,
  resolveVideoComposeMediaClockMs,
  resolveVideoComposePreviewTrack,
  type VideoComposeActiveMediaClock,
} from "../application/videoComposePreview";
import {
  activeClipAt,
  timelineDurationMs,
  type ComposeTimelineState,
} from "../domain/videoComposeTimeline";

import { useVideoComposePlaybackClock } from "./useVideoComposePlaybackClock";
import {
  useVideoComposeTrackMediaSync,
  type VideoComposeMediaUrlResolver,
} from "./useVideoComposeTrackMediaSync";

export function useVideoComposePlaybackController(
  timeline: ComposeTimelineState,
  pxPerSec: number,
  resolveMediaUrl: VideoComposeMediaUrlResolver,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackScrollRef = useRef<HTMLDivElement | null>(null);
  const playheadElRef = useRef<HTMLDivElement | null>(null);
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const pxPerMs = pxPerSec / 1000;
  const pxPerMsRef = useRef(pxPerMs);
  pxPerMsRef.current = pxPerMs;
  const playingRef = useRef(false);
  const activeMediaClockRef = useRef<VideoComposeActiveMediaClock | null>(null);
  const durationMs = useMemo(() => timelineDurationMs(timeline), [timeline]);

  const positionPlayhead = useCallback((playheadMs: number) => {
    const x = playheadMs * pxPerMsRef.current;
    const playhead = playheadElRef.current;
    if (playhead) playhead.style.transform = `translateX(${x}px)`;
    if (!playingRef.current) return;
    const container = trackScrollRef.current;
    if (!container) return;
    const viewportWidth = container.clientWidth;
    const margin = Math.min(96, viewportWidth * 0.2);
    const left = container.scrollLeft;
    if (x > left + viewportWidth - margin) {
      container.scrollLeft = x - viewportWidth + margin;
    } else if (x < left + margin) {
      container.scrollLeft = Math.max(0, x - margin);
    }
  }, []);

  useEffect(() => {
    const container = trackScrollRef.current;
    if (!container) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      container.scrollLeft +=
        event.deltaY !== 0 ? event.deltaY : event.deltaX;
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, []);

  const mediaClockMs = useCallback((): number | null => {
    const video = videoRef.current;
    if (!video) return null;
    return resolveVideoComposeMediaClockMs(activeMediaClockRef.current, {
      loadedClipId: video.dataset.clipId ?? null,
      currentTimeSeconds: video.currentTime,
      paused: video.paused,
      seeking: video.seeking,
      readyState: video.readyState,
    });
  }, []);

  const { playheadMs, isPlaying, play, toggle, seek } =
    useVideoComposePlaybackClock(durationMs, positionPlayhead, mediaClockMs);
  const playheadRef = useRef(playheadMs);
  playheadRef.current = playheadMs;
  playingRef.current = isPlaying;

  const handleFullscreenPlay = useCallback(() => {
    const stage = previewStageRef.current;
    if (stage?.requestFullscreen) {
      void stage.requestFullscreen().catch(() => {});
    }
    seek(0);
    play();
  }, [play, seek]);

  useEffect(() => {
    if (!isPlaying) positionPlayhead(playheadMs);
  }, [isPlaying, playheadMs, positionPlayhead, pxPerSec]);

  const videoTrack = useMemo(
    () => resolveVideoComposePreviewTrack(timeline, "video", playheadMs),
    [playheadMs, timeline],
  );
  const audioTrack = useMemo(
    () => resolveVideoComposePreviewTrack(timeline, "audio", playheadMs),
    [playheadMs, timeline],
  );
  const hasAudioTrack = useMemo(
    () =>
      timeline.tracks.some(
        (track) => track.kind === "audio" && track.clips.length > 0,
      ),
    [timeline],
  );

  useVideoComposeTrackMediaSync(
    videoRef,
    videoTrack,
    playheadMs,
    isPlaying,
    hasAudioTrack,
    resolveMediaUrl,
  );
  useVideoComposeTrackMediaSync(
    audioRef,
    audioTrack,
    playheadMs,
    isPlaying,
    false,
    resolveMediaUrl,
  );

  const videoActive = useMemo(
    () => (videoTrack ? activeClipAt(videoTrack, playheadMs) : null),
    [playheadMs, videoTrack],
  );
  activeMediaClockRef.current =
    projectVideoComposeActiveMediaClock(videoActive);
  const videoSource = useMemo(
    () =>
      videoActive
        ? resolveMediaUrl(videoActive.laid.clip.sourceUrl)
        : null,
    [resolveMediaUrl, videoActive],
  );

  return {
    videoRef,
    audioRef,
    trackScrollRef,
    playheadElRef,
    playheadRef,
    previewStageRef,
    pxPerMs,
    pxPerMsRef,
    durationMs,
    playheadMs,
    isPlaying,
    toggle,
    seek,
    handleFullscreenPlay,
    videoTrack,
    audioTrack,
    videoSource,
  };
}
