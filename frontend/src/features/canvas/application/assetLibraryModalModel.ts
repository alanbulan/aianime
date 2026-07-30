// Copyright (c) 2026 AI anime
import type {
  CanvasAssetLibraryItem,
  CanvasAssetLibraryMedia,
  CanvasAssetLibrarySelection,
  CanvasAssetLibrarySource,
} from '@/features/canvas/domain/assetLibrary';

export type AssetLibraryTabKey = 'image' | 'scene' | 'video' | 'audio';

export interface AssetLibraryTab {
  key: AssetLibraryTabKey;
  label: string;
  media: CanvasAssetLibraryMedia;
  accept: string;
  allowUpload: boolean;
}

export const ASSET_LIBRARY_TABS: readonly AssetLibraryTab[] = [
  {
    key: 'image',
    label: '图片',
    media: 'image',
    accept: 'image/*',
    allowUpload: true,
  },
  {
    key: 'scene',
    label: '场景',
    media: 'image',
    accept: 'image/*',
    allowUpload: false,
  },
  {
    key: 'video',
    label: '视频',
    media: 'video',
    accept: 'video/*',
    allowUpload: true,
  },
  {
    key: 'audio',
    label: '音频',
    media: 'audio',
    accept: 'audio/*',
    allowUpload: true,
  },
];

const ASSET_LIBRARY_SOURCE_LABELS: Record<CanvasAssetLibrarySource, string> = {
  upload: '上传',
  character: '人物',
  scene: '场景',
  prop: '道具',
};

export function resolveAssetLibraryTabs(
  allowedMedia?: readonly CanvasAssetLibraryMedia[],
): AssetLibraryTab[] {
  return ASSET_LIBRARY_TABS.filter(
    (tab) => !allowedMedia || allowedMedia.includes(tab.media),
  );
}

export function resolveAssetLibraryActiveTab(
  tabs: readonly AssetLibraryTab[],
  activeTabKey: AssetLibraryTabKey,
): AssetLibraryTab | undefined {
  return tabs.find((tab) => tab.key === activeTabKey) ?? tabs[0];
}

export function assetLibraryEntryMatchesTab(
  entry: CanvasAssetLibraryItem,
  tabKey: AssetLibraryTabKey,
): boolean {
  switch (tabKey) {
    case 'image':
      return entry.media === 'image' && entry.source !== 'scene';
    case 'scene':
      return entry.media === 'image' && entry.source === 'scene';
    case 'video':
      return entry.media === 'video';
    case 'audio':
      return entry.media === 'audio';
  }
}

export function filterAssetLibraryEntries(
  entries: readonly CanvasAssetLibraryItem[],
  tab: AssetLibraryTab | undefined,
): CanvasAssetLibraryItem[] {
  return tab
    ? entries.filter((entry) => assetLibraryEntryMatchesTab(entry, tab.key))
    : [];
}

export function assetLibraryAcceptsMimeType(
  mimeType: string,
  media: CanvasAssetLibraryMedia,
): boolean {
  return mimeType.startsWith(`${media}/`);
}

export function assetLibraryUploadName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

export function assetLibrarySelectionKey(
  entry: CanvasAssetLibraryItem,
): string {
  return `${entry.media}:${entry.id ?? `url:${entry.url}`}`;
}

export function toggleAssetLibrarySelection(
  selectedKeys: string[],
  key: string,
  maxSelectable: number,
): string[] {
  if (selectedKeys.includes(key)) {
    return selectedKeys.filter((selectedKey) => selectedKey !== key);
  }
  const media = key.split(':', 1)[0];
  const sameMediaCount = selectedKeys.filter((selectedKey) =>
    selectedKey.startsWith(`${media}:`),
  ).length;
  return sameMediaCount >= maxSelectable
    ? selectedKeys
    : [...selectedKeys, key];
}

export function countAssetLibrarySelections(
  selectedKeys: readonly string[],
  media: CanvasAssetLibraryMedia,
): number {
  return selectedKeys.filter((key) => key.startsWith(`${media}:`)).length;
}

export function projectAssetLibrarySelections(
  entries: readonly CanvasAssetLibraryItem[],
  selectedKeys: readonly string[],
): CanvasAssetLibrarySelection[] {
  const entriesByKey = new Map(
    entries.map((entry) => [assetLibrarySelectionKey(entry), entry]),
  );
  return selectedKeys.flatMap((key) => {
    const entry = entriesByKey.get(key);
    return entry?.url
      ? [{ media: entry.media, url: entry.url, name: entry.name }]
      : [];
  });
}

export function assetLibrarySourceLabel(
  source: CanvasAssetLibrarySource,
): string {
  return ASSET_LIBRARY_SOURCE_LABELS[source];
}
