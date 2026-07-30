// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from 'vitest';

import { probeVideoComposeMediaDuration } from './browserVideoComposeMediaRuntime';

interface FakeMediaElement {
  element: HTMLMediaElement;
  listeners: Map<string, EventListener>;
  load: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
}

function fakeMediaElement(duration: number): FakeMediaElement {
  const listeners = new Map<string, EventListener>();
  const load = vi.fn();
  const removeAttribute = vi.fn();
  const element = {
    preload: '',
    muted: false,
    src: '',
    duration,
    load,
    removeAttribute,
    addEventListener: vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') listeners.set(type, listener);
      },
    ),
  } as unknown as HTMLMediaElement;
  return { element, listeners, load, removeAttribute };
}

describe('browserVideoComposeMediaRuntime', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the resolved video URL and returns rounded milliseconds', async () => {
    const fake = fakeMediaElement(12.3456);
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockReturnValue(fake.element);

    const pending = probeVideoComposeMediaDuration(
      '/clip.mp4',
      'video',
      (url) => `display:${url}`,
    );
    fake.listeners.get('loadedmetadata')?.(new Event('loadedmetadata'));

    await expect(pending).resolves.toBe(12_346);
    expect(createElement).toHaveBeenCalledWith('video');
    expect(fake.element.src).toBe('display:/clip.mp4');
    expect(fake.element.preload).toBe('metadata');
    expect(fake.element.muted).toBe(true);
    expect(fake.removeAttribute).toHaveBeenCalledWith('src');
  });

  it('returns null for an audio metadata error', async () => {
    const fake = fakeMediaElement(Number.NaN);
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockReturnValue(fake.element);

    const pending = probeVideoComposeMediaDuration(
      '/voice.wav',
      'audio',
      (url) => url,
    );
    fake.listeners.get('error')?.(new Event('error'));

    await expect(pending).resolves.toBeNull();
    expect(createElement).toHaveBeenCalledWith('audio');
  });

  it('returns null when the media element cannot start loading', async () => {
    const fake = fakeMediaElement(5);
    fake.load.mockImplementationOnce(() => {
      throw new Error('load unavailable');
    });
    vi.spyOn(document, 'createElement').mockReturnValue(fake.element);

    await expect(
      probeVideoComposeMediaDuration('/broken.mp4', 'video', (url) => url),
    ).resolves.toBeNull();
  });
});
