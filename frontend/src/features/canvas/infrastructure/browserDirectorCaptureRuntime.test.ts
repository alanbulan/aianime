// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  directorCaptureBlobToDataUrl,
  readDirectorCaptureImageSize,
} from './browserDirectorCaptureRuntime';

afterEach(() => vi.unstubAllGlobals());

describe('browserDirectorCaptureRuntime', () => {
  it('reads capture blobs as data URLs', async () => {
    class TestFileReader {
      result: string | ArrayBuffer | null = null;
      error: DOMException | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      readAsDataURL(): void {
        this.result = 'data:image/png;base64,AAAA';
        this.onload?.();
      }
    }
    vi.stubGlobal('FileReader', TestFileReader);

    await expect(
      directorCaptureBlobToDataUrl(new Blob(['capture'])),
    ).resolves.toBe('data:image/png;base64,AAAA');
  });

  it('reads natural image dimensions with a one-pixel fallback', async () => {
    class TestImage {
      naturalWidth = 1920;
      naturalHeight = 1080;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        this.onload?.();
      }
    }
    vi.stubGlobal('Image', TestImage);

    await expect(
      readDirectorCaptureImageSize('data:image/png;base64,A'),
    ).resolves.toEqual({ width: 1920, height: 1080 });
  });
});
