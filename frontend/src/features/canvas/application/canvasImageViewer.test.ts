// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  createClosedCanvasImageViewer,
  navigateCanvasImageViewer,
  openCanvasImageViewer,
} from './canvasImageViewer';

describe('Canvas image viewer state', () => {
  it('creates a closed empty viewer', () => {
    expect(createClosedCanvasImageViewer()).toEqual({
      isOpen: false,
      currentImageUrl: null,
      imageList: [],
      currentIndex: 0,
    });
  });

  it('opens a standalone image or selects it inside the supplied list', () => {
    expect(openCanvasImageViewer('only.png')).toEqual({
      isOpen: true,
      currentImageUrl: 'only.png',
      imageList: ['only.png'],
      currentIndex: 0,
    });

    const imageList = ['first.png', 'second.png', 'third.png'];
    const opened = openCanvasImageViewer('second.png', imageList);
    expect(opened).toEqual({
      isOpen: true,
      currentImageUrl: 'second.png',
      imageList,
      currentIndex: 1,
    });
    expect(opened.imageList).toBe(imageList);
  });

  it('keeps the requested URL and falls back to index zero when it is absent', () => {
    expect(openCanvasImageViewer('missing.png', ['first.png'])).toEqual({
      isOpen: true,
      currentImageUrl: 'missing.png',
      imageList: ['first.png'],
      currentIndex: 0,
    });
  });

  it('navigates without wrapping and preserves identity at list boundaries', () => {
    const opened = openCanvasImageViewer('second.png', [
      'first.png',
      'second.png',
      'third.png',
    ]);
    const previous = navigateCanvasImageViewer(opened, 'prev');
    expect(previous).toMatchObject({
      currentImageUrl: 'first.png',
      currentIndex: 0,
    });
    expect(navigateCanvasImageViewer(previous, 'prev')).toBe(previous);

    const next = navigateCanvasImageViewer(opened, 'next');
    expect(next).toMatchObject({
      currentImageUrl: 'third.png',
      currentIndex: 2,
    });
    expect(navigateCanvasImageViewer(next, 'next')).toBe(next);
  });
});
