// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  collectDroppedMediaFiles,
  resolveClipboardImageFile,
} from './canvasMediaTransfer';

function clipboardEvent(items: Array<{ type: string; file: File | null }>): ClipboardEvent {
  return {
    clipboardData: {
      items: items.map((item) => ({
        type: item.type,
        getAsFile: () => item.file,
      })),
    },
  } as unknown as ClipboardEvent;
}

function dataTransfer(files: File[]): DataTransfer {
  return { files } as unknown as DataTransfer;
}

describe('Canvas media transfer', () => {
  it('returns the first named clipboard image and skips other item kinds', () => {
    const image = new File(['image'], 'frame.png', { type: 'image/png' });
    const event = clipboardEvent([
      { type: 'text/plain', file: new File(['text'], 'note.txt') },
      { type: 'image/png', file: null },
      { type: 'image/png', file: image },
    ]);

    expect(resolveClipboardImageFile(event)).toBe(image);
    expect(resolveClipboardImageFile(clipboardEvent([]))).toBeNull();
  });

  it('assigns a stable extension when a clipboard image has no name', () => {
    const unnamed = new File(['image'], '', { type: 'image/svg+xml' });
    const result = resolveClipboardImageFile(
      clipboardEvent([{ type: 'image/svg+xml', file: unnamed }]),
    );

    expect(result?.name).toBe('pasted-image.svg');
    expect(result?.type).toBe('image/svg+xml');
  });

  it('keeps image, video and audio drops including extension-only video types', () => {
    const image = new File(['image'], 'frame.png', { type: 'image/png' });
    const video = new File(['video'], 'clip.mp4', { type: 'video/mp4' });
    const mxf = new File(['video'], 'source.mxf');
    const audio = new File(['audio'], 'voice.mp3', { type: 'audio/mpeg' });
    const text = new File(['text'], 'notes.txt', { type: 'text/plain' });

    expect(
      collectDroppedMediaFiles(dataTransfer([image, video, mxf, audio, text])),
    ).toEqual([image, video, mxf, audio]);
    expect(collectDroppedMediaFiles(dataTransfer([]))).toEqual([]);
  });
});
