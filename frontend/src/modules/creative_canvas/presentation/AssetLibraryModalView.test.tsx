// Copyright (c) 2026 AI anime
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  assetLibrarySelectionKey,
  resolveAssetLibraryTabs,
} from '../application/assetLibraryModalModel';
import type { AssetLibraryModalController } from './useAssetLibraryModalController';

import { AssetLibraryModalView } from './AssetLibraryModalView';

const resolveMediaUrl = (url: string) => `display:${url}`;

function controller(
  overrides: Partial<AssetLibraryModalController> = {},
): AssetLibraryModalController {
  const tabs = resolveAssetLibraryTabs();
  return {
    open: true,
    project: 'project-view',
    onClose: vi.fn(),
    maxSelectable: 9,
    tabs,
    activeTabKey: 'image',
    setActiveTabKey: vi.fn(),
    activeTab: tabs[0],
    activeMedia: 'image',
    fileInputRef: createRef<HTMLInputElement>(),
    isLoadingLibrary: false,
    libraryError: null,
    isSyncing: false,
    deletingId: null,
    pendingUploads: [],
    isDragging: false,
    setIsDragging: vi.fn(),
    visibleItems: [],
    visiblePending: [],
    totalCount: 0,
    activeSelectedCount: 0,
    hasSelection: false,
    handleSyncFromMainline: vi.fn(async () => undefined),
    removePending: vi.fn(),
    handleFiles: vi.fn(),
    handleDeleteEntry: vi.fn(async () => undefined),
    handleDrop: vi.fn(),
    selectionKey: assetLibrarySelectionKey,
    isSelected: vi.fn(() => false),
    toggleSelect: vi.fn(),
    handleConfirm: vi.fn(),
    ...overrides,
  } as AssetLibraryModalController;
}

describe('AssetLibraryModalView', () => {
  it('renders nothing while closed', () => {
    render(
      <AssetLibraryModalView
        controller={controller({ open: false })}
        resolveMediaUrl={resolveMediaUrl}
      />,
    );

    expect(screen.queryByText('资产库')).not.toBeInTheDocument();
  });

  it('renders asset commands and forwards selection, deletion, and confirmation', () => {
    const setActiveTabKey = vi.fn();
    const handleSyncFromMainline = vi.fn(async () => undefined);
    const handleDeleteEntry = vi.fn(async () => undefined);
    const toggleSelect = vi.fn();
    const handleConfirm = vi.fn();
    const image = {
      id: 'image-a',
      name: '角色参考',
      media: 'image' as const,
      source: 'character' as const,
      url: '/assets/image-a.png',
    };
    const uploaded = {
      id: 'image-upload',
      name: '本地图片',
      media: 'image' as const,
      source: 'upload' as const,
      url: '/assets/upload.png',
    };
    render(
      <AssetLibraryModalView
        controller={controller({
          setActiveTabKey,
          handleSyncFromMainline,
          handleDeleteEntry,
          toggleSelect,
          handleConfirm,
          visibleItems: [image, uploaded],
          totalCount: 2,
          hasSelection: true,
        })}
        resolveMediaUrl={resolveMediaUrl}
      />,
    );

    expect(screen.getByText('人物')).toBeInTheDocument();
    expect(screen.getByAltText('角色参考')).toHaveAttribute(
      'src',
      'display:/assets/image-a.png',
    );
    fireEvent.click(screen.getByText('视频'));
    expect(setActiveTabKey).toHaveBeenCalledWith('video');
    fireEvent.click(screen.getByText('重新同步'));
    expect(handleSyncFromMainline).toHaveBeenCalledOnce();
    fireEvent.click(screen.getAllByTitle('选择')[0]);
    expect(toggleSelect).toHaveBeenCalledWith('image:image-a');
    fireEvent.click(screen.getByTitle('删除'));
    expect(handleDeleteEntry).toHaveBeenCalledWith(uploaded);
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    expect(handleConfirm).toHaveBeenCalledOnce();
  });

  it('renders read-only scene empty state and failed-upload removal', () => {
    const tabs = resolveAssetLibraryTabs();
    const removePending = vi.fn();
    const { rerender } = render(
      <AssetLibraryModalView
        controller={controller({
          activeTabKey: 'scene',
          activeTab: tabs[1],
          visiblePending: [],
        })}
        resolveMediaUrl={resolveMediaUrl}
      />,
    );

    expect(screen.queryByText('本地上传')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        '主线暂无场景，或已自动同步为空；可点右上角「重新同步」重试。',
      ),
    ).toBeInTheDocument();

    rerender(
      <AssetLibraryModalView
        controller={controller({
          removePending,
          visiblePending: [
            {
              id: 'pending-a',
              fileName: 'failed.png',
              previewUrl: 'blob:failed',
              media: 'image',
              status: 'failed',
              error: 'network unavailable',
            },
          ],
          totalCount: 1,
        })}
        resolveMediaUrl={resolveMediaUrl}
      />,
    );

    expect(screen.getByText('上传失败')).toBeInTheDocument();
    expect(screen.getByText('network unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('移除'));
    expect(removePending).toHaveBeenCalledWith('pending-a');
  });
});
