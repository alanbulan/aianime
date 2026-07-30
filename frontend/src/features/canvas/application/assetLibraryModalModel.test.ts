// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import type { CanvasAssetLibraryItem } from '@/features/canvas/domain/assetLibrary';

import {
  assetLibraryAcceptsMimeType,
  assetLibraryEntryMatchesTab,
  assetLibrarySelectionKey,
  assetLibrarySourceLabel,
  assetLibraryUploadName,
  countAssetLibrarySelections,
  filterAssetLibraryEntries,
  projectAssetLibrarySelections,
  resolveAssetLibraryActiveTab,
  resolveAssetLibraryTabs,
  toggleAssetLibrarySelection,
} from './assetLibraryModalModel';

function entry(
  id: string | null,
  media: CanvasAssetLibraryItem['media'],
  source: CanvasAssetLibraryItem['source'],
  url = `/assets/${id ?? 'anonymous'}`,
): CanvasAssetLibraryItem {
  return {
    id,
    name: id ?? 'anonymous',
    media,
    source,
    url,
  };
}

describe('assetLibraryModalModel', () => {
  it('filters tabs by media while preserving image and scene categories', () => {
    const tabs = resolveAssetLibraryTabs(['image']);

    expect(tabs.map((tab) => tab.key)).toEqual(['image', 'scene']);
    expect(resolveAssetLibraryActiveTab(tabs, 'video')).toBe(tabs[0]);
  });

  it('keeps scene images out of the ordinary image tab', () => {
    const image = entry('image-a', 'image', 'upload');
    const scene = entry('scene-a', 'image', 'scene');
    const tabs = resolveAssetLibraryTabs();
    const imageTab = resolveAssetLibraryActiveTab(tabs, 'image');
    const sceneTab = resolveAssetLibraryActiveTab(tabs, 'scene');

    expect(assetLibraryEntryMatchesTab(image, 'image')).toBe(true);
    expect(assetLibraryEntryMatchesTab(scene, 'image')).toBe(false);
    expect(filterAssetLibraryEntries([image, scene], imageTab)).toEqual([
      image,
    ]);
    expect(filterAssetLibraryEntries([image, scene], sceneTab)).toEqual([
      scene,
    ]);
  });

  it('accepts files by active media MIME and removes only the last extension', () => {
    expect(assetLibraryAcceptsMimeType('video/mp4', 'video')).toBe(true);
    expect(assetLibraryAcceptsMimeType('audio/wav', 'video')).toBe(false);
    expect(assetLibraryUploadName('shot.final.png')).toBe('shot.final');
    expect(assetLibraryUploadName('.hidden')).toBe('.hidden');
  });

  it('uses stable ids when available and URL fallback keys otherwise', () => {
    expect(assetLibrarySelectionKey(entry('asset-a', 'image', 'upload'))).toBe(
      'image:asset-a',
    );
    expect(
      assetLibrarySelectionKey(
        entry(null, 'video', 'upload', '/video/result.mp4'),
      ),
    ).toBe('video:url:/video/result.mp4');
  });

  it('applies independent selection quotas for each media type', () => {
    const selected = ['image:image-a', 'video:video-a'];

    expect(toggleAssetLibrarySelection(selected, 'image:image-b', 1)).toEqual(
      selected,
    );
    expect(toggleAssetLibrarySelection(selected, 'audio:audio-a', 1)).toEqual([
      ...selected,
      'audio:audio-a',
    ]);
    expect(toggleAssetLibrarySelection(selected, 'image:image-a', 1)).toEqual([
      'video:video-a',
    ]);
    expect(countAssetLibrarySelections(selected, 'image')).toBe(1);
  });

  it('projects confirmed entries in selection order and ignores stale keys', () => {
    const image = entry('image-a', 'image', 'character');
    const audio = entry('audio-a', 'audio', 'upload');

    expect(
      projectAssetLibrarySelections(
        [image, audio],
        ['audio:audio-a', 'missing:key', 'image:image-a'],
      ),
    ).toEqual([
      { media: 'audio', url: audio.url, name: audio.name },
      { media: 'image', url: image.url, name: image.name },
    ]);
    expect(assetLibrarySourceLabel('character')).toBe('人物');
  });
});
