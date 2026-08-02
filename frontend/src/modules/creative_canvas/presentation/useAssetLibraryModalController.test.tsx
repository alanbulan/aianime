// Copyright (c) 2026 AI anime
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanvasAssetLibraryItem } from '../domain/assetLibrary';

import { useAssetLibraryModalController } from './useAssetLibraryModalController';

const mocks = vi.hoisted(() => ({
  loadLibrary: vi.fn(),
  syncLibrary: vi.fn(),
  addItem: vi.fn(),
  deleteItem: vi.fn(),
  uploadAsset: vi.fn(),
  createObjectUrl: vi.fn(),
  revokeObjectUrl: vi.fn(),
}));

vi.mock('../assetLibraryComposition', () => ({
  loadCanvasAssetLibrary: (project: string) => mocks.loadLibrary(project),
  syncCanvasAssetLibraryFromMainline: (project: string) =>
    mocks.syncLibrary(project),
  addCanvasAssetLibraryItem: (project: string, item: unknown) =>
    mocks.addItem(project, item),
  deleteCanvasAssetLibraryItem: (project: string, id: string) =>
    mocks.deleteItem(project, id),
}));

vi.mock('../assetTransferComposition', () => ({
  uploadFreezoneAsset: (
    project: string,
    file: File,
    fileName: string,
    options?: unknown,
  ) => mocks.uploadAsset(project, file, fileName, options),
}));

function item(
  id: string,
  media: CanvasAssetLibraryItem['media'] = 'image',
  source: CanvasAssetLibraryItem['source'] = 'upload',
): CanvasAssetLibraryItem {
  return {
    id,
    name: id,
    media,
    source,
    url: `/assets/${id}`,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('useAssetLibraryModalController', () => {
  beforeEach(() => {
    mocks.loadLibrary.mockReset().mockResolvedValue([]);
    mocks.syncLibrary.mockReset().mockResolvedValue([]);
    mocks.addItem.mockReset().mockResolvedValue(undefined);
    mocks.deleteItem.mockReset().mockResolvedValue(undefined);
    mocks.uploadAsset.mockReset().mockResolvedValue({ url: '/uploaded/file' });
    mocks.createObjectUrl.mockReset().mockReturnValue('blob:preview');
    mocks.revokeObjectUrl.mockReset();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: mocks.createObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: mocks.revokeObjectUrl,
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('loads existing entries, auto-syncs on open, and reports success', async () => {
    const onSuccess = vi.fn();
    const synced = [item('synced-image', 'image', 'character')];
    mocks.loadLibrary.mockResolvedValue([item('existing-image')]);
    mocks.syncLibrary.mockResolvedValue(synced);

    const { result } = renderHook(() =>
      useAssetLibraryModalController({
        open: true,
        project: 'project-a',
        onClose: vi.fn(),
        onSuccess,
      }),
    );

    await waitFor(() => expect(result.current.isLoadingLibrary).toBe(false));
    expect(mocks.loadLibrary).toHaveBeenCalledWith('project-a');
    expect(mocks.syncLibrary).toHaveBeenCalledWith('project-a');
    expect(result.current.visibleItems).toEqual(synced);
    expect(result.current.libraryError).toBeNull();
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('shows auto-sync errors only when no existing library is available', async () => {
    mocks.syncLibrary.mockRejectedValue(new Error('sync unavailable'));
    const { result, unmount } = renderHook(() =>
      useAssetLibraryModalController({
        open: true,
        project: 'empty-project',
        onClose: vi.fn(),
      }),
    );

    await waitFor(() =>
      expect(result.current.libraryError).toBe('sync unavailable'),
    );
    unmount();

    mocks.loadLibrary.mockReset().mockResolvedValue([item('existing-image')]);
    mocks.syncLibrary.mockReset().mockRejectedValue(new Error('still offline'));
    const second = renderHook(() =>
      useAssetLibraryModalController({
        open: true,
        project: 'existing-project',
        onClose: vi.fn(),
      }),
    );

    await waitFor(() =>
      expect(second.result.current.isLoadingLibrary).toBe(false),
    );
    expect(second.result.current.libraryError).toBeNull();
    expect(second.result.current.visibleItems).toEqual([
      item('existing-image'),
    ]);
  });

  it('discards an auto-sync result after the modal closes', async () => {
    const pendingSync = deferred<CanvasAssetLibraryItem[]>();
    const onSuccess = vi.fn();
    mocks.syncLibrary.mockReturnValue(pendingSync.promise);
    const { result, rerender } = renderHook(
      ({ open }) =>
        useAssetLibraryModalController({
          open,
          project: 'project-cancel',
          onClose: vi.fn(),
          onSuccess,
        }),
      { initialProps: { open: true } },
    );

    await waitFor(() => expect(mocks.syncLibrary).toHaveBeenCalledOnce());
    rerender({ open: false });
    await act(async () => {
      pendingSync.resolve([item('late-image')]);
      await pendingSync.promise;
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.visibleItems).toEqual([]);
  });

  it('uploads only matching files and disables timeout for video assets', async () => {
    const onSuccess = vi.fn();
    mocks.uploadAsset.mockResolvedValue({
      url: '/uploaded/clip.final.mp4?token=temporary',
    });
    const { result } = renderHook(() =>
      useAssetLibraryModalController({
        open: true,
        project: 'project-upload',
        onClose: vi.fn(),
        onSuccess,
      }),
    );
    await waitFor(() => expect(result.current.isLoadingLibrary).toBe(false));
    onSuccess.mockClear();
    act(() => result.current.setActiveTabKey('video'));
    const video = new File(['video'], 'clip.final.mp4', { type: 'video/mp4' });
    const image = new File(['image'], 'still.png', { type: 'image/png' });

    act(() => result.current.handleFiles([video, image]));

    await waitFor(() => expect(mocks.addItem).toHaveBeenCalledOnce());
    expect(mocks.createObjectUrl).toHaveBeenCalledOnce();
    expect(mocks.createObjectUrl).toHaveBeenCalledWith(video);
    expect(mocks.uploadAsset).toHaveBeenCalledWith(
      'project-upload',
      video,
      'clip.final.mp4',
      { disableTimeout: true },
    );
    expect(mocks.addItem).toHaveBeenCalledWith('project-upload', {
      name: 'clip.final',
      media: 'video',
      url: '/uploaded/clip.final.mp4',
    });
    expect(mocks.revokeObjectUrl).toHaveBeenCalledWith('blob:preview');
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('keeps failed uploads removable and releases their preview URL', async () => {
    mocks.uploadAsset.mockRejectedValue(new Error('upload failed'));
    const { result } = renderHook(() =>
      useAssetLibraryModalController({
        open: true,
        project: 'project-failed',
        onClose: vi.fn(),
      }),
    );
    await waitFor(() => expect(result.current.isLoadingLibrary).toBe(false));
    const image = new File(['image'], 'failed.png', { type: 'image/png' });

    act(() => result.current.handleFiles([image]));
    await waitFor(() =>
      expect(result.current.visiblePending[0]?.status).toBe('failed'),
    );
    const pendingId = result.current.visiblePending[0]!.id;
    act(() => result.current.removePending(pendingId));

    expect(result.current.visiblePending).toEqual([]);
    expect(mocks.revokeObjectUrl).toHaveBeenCalledWith('blob:preview');
  });

  it('confirms selected assets in selection order and closes', async () => {
    const image = item('image-a');
    const video = item('video-a', 'video');
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    mocks.syncLibrary.mockResolvedValue([image, video]);
    const { result } = renderHook(() =>
      useAssetLibraryModalController({
        open: true,
        project: 'project-confirm',
        onClose,
        onConfirm,
        maxSelectable: 1,
      }),
    );
    await waitFor(() => expect(result.current.isLoadingLibrary).toBe(false));

    act(() => result.current.toggleSelect('video:video-a'));
    act(() => result.current.toggleSelect('image:image-a'));
    act(() => result.current.handleConfirm());

    expect(onConfirm).toHaveBeenCalledWith([
      { media: 'video', url: video.url, name: video.name },
      { media: 'image', url: image.url, name: image.name },
    ]);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
