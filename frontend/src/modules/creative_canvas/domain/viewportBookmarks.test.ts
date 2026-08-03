// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  BOOKMARK_SLOT_COUNT,
  bookmarkCenterInFlow,
  bookmarkIndexToDigit,
  createEmptyBookmarks,
  digitToBookmarkIndex,
  isViewportBookmark,
  normalizeBookmarks,
  projectToMinimap,
  replaceViewportBookmark,
  resolveCanvasOriginViewport,
} from './viewportBookmarks';

describe('viewport bookmarks domain', () => {
  it('centers a new canvas origin in the available viewport', () => {
    expect(resolveCanvasOriginViewport({ width: 800, height: 600 })).toEqual({
      x: 400,
      y: 300,
      zoom: 1,
    });
    expect(resolveCanvasOriginViewport({ width: 800, height: 600 }, 1.5)).toEqual({
      x: 400,
      y: 300,
      zoom: 1.5,
    });
    expect(resolveCanvasOriginViewport({ width: 800, height: 600 }, Number.NaN)).toEqual({
      x: 400,
      y: 300,
      zoom: 1,
    });
    expect(resolveCanvasOriginViewport({ width: 0, height: 600 }, 2)).toEqual({
      x: 0,
      y: 0,
      zoom: 1,
    });
    expect(resolveCanvasOriginViewport(null)).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('maps bookmark digits and indices in both directions', () => {
    expect(digitToBookmarkIndex('1')).toBe(0);
    expect(digitToBookmarkIndex('9')).toBe(8);
    expect(digitToBookmarkIndex('0')).toBe(9);
    expect(digitToBookmarkIndex('a')).toBeNull();
    expect(bookmarkIndexToDigit(0)).toBe('1');
    expect(bookmarkIndexToDigit(8)).toBe('9');
    expect(bookmarkIndexToDigit(9)).toBe('0');
    expect(bookmarkIndexToDigit(10)).toBeNull();
    expect(bookmarkIndexToDigit(-1)).toBeNull();
  });

  it('creates independent slots and replaces a valid slot immutably', () => {
    const bookmarks = createEmptyBookmarks();
    const other = createEmptyBookmarks();
    const bookmark = { x: 1, y: 2, zoom: 1.5 };
    const next = replaceViewportBookmark(bookmarks, 2, bookmark);

    expect(bookmarks).toHaveLength(BOOKMARK_SLOT_COUNT);
    bookmark.x = 999;
    bookmarks[0] = { x: 1, y: 2, zoom: 3 };
    expect(other[0]).toBeNull();
    expect(next).not.toBe(bookmarks);
    expect(next[2]).toEqual({ x: 1, y: 2, zoom: 1.5 });
    expect(replaceViewportBookmark(next, 99, null)).toBe(next);
  });

  it('normalizes persisted data and rejects malformed bookmarks', () => {
    const result = normalizeBookmarks([
      { x: 10, y: 20, zoom: 1.5 },
      { x: 'bad', y: 0, zoom: 1 },
      null,
      { x: 0, y: 0 },
      42,
      { x: 1, y: 2, zoom: 0 },
    ]);
    expect(result).toHaveLength(BOOKMARK_SLOT_COUNT);
    expect(result[0]).toEqual({ x: 10, y: 20, zoom: 1.5 });
    expect(result.slice(1, 6).every((slot) => slot === null)).toBe(true);
    expect(normalizeBookmarks(undefined).every((slot) => slot === null)).toBe(true);
    expect(isViewportBookmark({ x: 0, y: 0, zoom: 1 })).toBe(true);
    for (const invalid of [
      null,
      {},
      { x: 0, y: 0 },
      { x: 0, y: 0, zoom: 0 },
      { x: 0, y: 0, zoom: Infinity },
      { x: 0, y: 0, zoom: Number.NaN },
      [1, 2, 3],
    ]) {
      expect(isViewportBookmark(invalid)).toBe(false);
    }
  });

  it('projects bookmark centers into clamped minimap coordinates', () => {
    expect(bookmarkCenterInFlow(
      { x: -200, y: -100, zoom: 2 },
      { width: 800, height: 600 },
    )).toEqual({ x: 300, y: 200 });
    expect(projectToMinimap(
      { x: 500, y: 250 },
      { x: 0, y: 0, width: 1000, height: 500 },
      { width: 200, height: 100 },
    )).toEqual({ x: 100, y: 50 });
    expect(projectToMinimap(
      { x: 5000, y: -100 },
      { x: 0, y: 0, width: 1000, height: 500 },
      { width: 200, height: 100 },
    )).toEqual({ x: 200, y: 0 });
  });
});
