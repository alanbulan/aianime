// Copyright (c) 2026 AI anime
import { createRef } from 'react';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  ComposeClip,
  ComposeTrack,
} from '@/features/canvas/domain/videoComposeTimeline';

import { useVideoComposeTrackMediaSync } from './useVideoComposeTrackMediaSync';

vi.mock('@/features/canvas/application/imageData', () => ({
  resolveImageDisplayUrl: (url: string) => `display:${url}`,
}));

interface FakeMedia {
  element: HTMLVideoElement;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
  fire: (type: string) => void;
  listenerCount: (type: string) => number;
}

function fakeMedia(): FakeMedia {
  const listeners = new Map<string, Set<EventListener>>();
  const play = vi.fn().mockResolvedValue(undefined);
  const pause = vi.fn();
  const load = vi.fn();
  const removeAttribute = vi.fn();
  const element = {
    src: '',
    dataset: {} as DOMStringMap,
    currentTime: 0,
    volume: 1,
    muted: false,
    playbackRate: 1,
    seeking: false,
    readyState: 2,
    play,
    pause,
    load,
    removeAttribute,
    addEventListener: vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener !== 'function') return;
        const bucket = listeners.get(type) ?? new Set<EventListener>();
        bucket.add(listener);
        listeners.set(type, bucket);
      },
    ),
    removeEventListener: vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') listeners.get(type)?.delete(listener);
      },
    ),
  } as unknown as HTMLVideoElement;
  return {
    element,
    play,
    pause,
    load,
    removeAttribute,
    fire: (type) => {
      for (const listener of [...(listeners.get(type) ?? [])]) {
        listener(new Event(type));
      }
    },
    listenerCount: (type) => listeners.get(type)?.size ?? 0,
  };
}

function clip(patch: Partial<ComposeClip> = {}): ComposeClip {
  return {
    id: 'clip-a',
    nodeId: 'video-a',
    kind: 'video',
    sourceUrl: '/clip-a.mp4',
    displayName: '片段 A',
    thumbUrl: null,
    durationMs: 5_000,
    timelineStartMs: 0,
    trimStartMs: 1_000,
    trimEndMs: 5_000,
    volume: 0.4,
    muted: false,
    speed: 2,
    ...patch,
  };
}

function track(entry: ComposeClip = clip()): ComposeTrack {
  return { id: 'track-video', kind: 'video', clips: [entry] };
}

describe('useVideoComposeTrackMediaSync', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the active clip, seeks on metadata, and clears media in a gap', () => {
    const media = fakeMedia();
    const ref = createRef<HTMLVideoElement>();
    ref.current = media.element;
    const { rerender } = renderHook(
      ({ playheadMs, isPlaying }) =>
        useVideoComposeTrackMediaSync(
          ref,
          track(),
          playheadMs,
          isPlaying,
          false,
        ),
      { initialProps: { playheadMs: 500, isPlaying: true } },
    );

    expect(media.element.dataset.clipId).toBe('clip-a');
    expect(media.element.src).toBe('display:/clip-a.mp4');
    expect(media.load).toHaveBeenCalled();
    expect(media.element.volume).toBe(0.4);
    expect(media.element.playbackRate).toBe(2);
    media.play.mockClear();
    media.fire('loadedmetadata');
    expect(media.element.currentTime).toBe(2);
    expect(media.play).toHaveBeenCalledOnce();

    rerender({ playheadMs: 5_000, isPlaying: false });
    expect(media.pause).toHaveBeenCalled();
    expect(media.removeAttribute).toHaveBeenCalledWith('src');
    expect(media.element.dataset.clipId).toBeUndefined();
  });

  it('mirrors volume, mute, playback rate, and play state', () => {
    const media = fakeMedia();
    const ref = createRef<HTMLVideoElement>();
    ref.current = media.element;
    const mediaTrack = track(clip({ speed: 1.5, volume: 0.25 }));
    const { rerender } = renderHook(
      ({ isPlaying, forceMuted }) =>
        useVideoComposeTrackMediaSync(
          ref,
          mediaTrack,
          200,
          isPlaying,
          forceMuted,
        ),
      { initialProps: { isPlaying: false, forceMuted: true } },
    );

    expect(media.element.volume).toBe(0.25);
    expect(media.element.muted).toBe(true);
    expect(media.element.playbackRate).toBe(1.5);
    expect(media.pause).toHaveBeenCalled();

    media.play.mockClear();
    rerender({ isPlaying: true, forceMuted: false });
    expect(media.element.muted).toBe(false);
    expect(media.play).toHaveBeenCalled();
  });

  it('coalesces paused scrubbing and pursues only the latest seek target', () => {
    const media = fakeMedia();
    const ref = createRef<HTMLVideoElement>();
    ref.current = media.element;
    const mediaTrack = track(clip({ trimStartMs: 0, speed: 1 }));
    const { rerender } = renderHook(
      ({ playheadMs }) =>
        useVideoComposeTrackMediaSync(
          ref,
          mediaTrack,
          playheadMs,
          false,
          false,
        ),
      { initialProps: { playheadMs: 100 } },
    );
    expect(media.element.currentTime).toBe(0.1);

    Object.defineProperty(media.element, 'seeking', {
      configurable: true,
      value: true,
    });
    rerender({ playheadMs: 500 });
    rerender({ playheadMs: 800 });
    expect(media.element.currentTime).toBe(0.1);

    Object.defineProperty(media.element, 'seeking', {
      configurable: true,
      value: false,
    });
    media.fire('seeked');
    expect(media.element.currentTime).toBe(0.8);
  });

  it('removes media listeners when the hook unmounts', () => {
    const media = fakeMedia();
    const ref = createRef<HTMLVideoElement>();
    ref.current = media.element;
    const { unmount } = renderHook(() =>
      useVideoComposeTrackMediaSync(ref, track(), 0, false, false),
    );

    expect(media.listenerCount('loadedmetadata')).toBe(1);
    expect(media.listenerCount('seeked')).toBe(1);
    unmount();
    expect(media.listenerCount('loadedmetadata')).toBe(0);
    expect(media.listenerCount('seeked')).toBe(0);
  });
});
