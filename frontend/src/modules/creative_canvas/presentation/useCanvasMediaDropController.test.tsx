// Copyright (c) 2026 AI anime
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DragEvent as ReactDragEvent } from 'react';

import {
  CANVAS_ASSET_DRAG_MIME,
  type CanvasAssetDragPayload,
} from '../domain/assetDrag';
import {
  useCanvasMediaDropController,
  type CanvasMediaDropControllerOptions,
} from './useCanvasMediaDropController';

function createOptions(): CanvasMediaDropControllerOptions {
  return {
    screenToFlowPosition: vi.fn(({ x, y }) => ({ x: x / 2, y: y / 2 })),
    hydrateAsset: vi.fn(async (payload) => payload),
    spawnAsset: vi.fn(() => 'asset-node'),
    createUploadNode: vi.fn()
      .mockReturnValueOnce('upload-1')
      .mockReturnValueOnce('upload-2'),
    selectNode: vi.fn(),
    attachExternalFile: vi.fn(),
    reportHydrationFailure: vi.fn(),
    scheduleAfterMount: vi.fn((callback) => callback()),
  };
}

function dropEvent({
  types,
  files = [],
  payload = '',
}: {
  types: string[];
  files?: File[];
  payload?: string;
}): ReactDragEvent<HTMLDivElement> {
  return {
    clientX: 200,
    clientY: 120,
    preventDefault: vi.fn(),
    dataTransfer: {
      types,
      files,
      getData: vi.fn(() => payload),
    },
  } as unknown as ReactDragEvent<HTMLDivElement>;
}

describe('useCanvasMediaDropController', () => {
  it('hydrates and spawns a sidebar asset at the drop position', async () => {
    const payload: CanvasAssetDragPayload = {
      kind: 'image',
      label: 'Asset',
      url: '/asset.png',
      source: {},
    };
    const hydrated = { ...payload, label: 'Hydrated asset' };
    const options = createOptions();
    vi.mocked(options.hydrateAsset).mockResolvedValue(hydrated);
    const event = dropEvent({
      types: [CANVAS_ASSET_DRAG_MIME],
      payload: JSON.stringify(payload),
    });
    const { result } = renderHook(() =>
      useCanvasMediaDropController(options));

    act(() => result.current.handleCanvasDrop(event));

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(options.screenToFlowPosition).toHaveBeenCalledWith({ x: 200, y: 120 });
    await waitFor(() => {
      expect(options.spawnAsset).toHaveBeenCalledWith(hydrated, { x: 100, y: 60 });
    });
    expect(options.selectNode).toHaveBeenCalledWith('asset-node');
    expect(options.createUploadNode).not.toHaveBeenCalled();
  });

  it('creates staggered upload nodes and attaches media after mount', () => {
    const image = new File(['image'], 'image.png', { type: 'image/png' });
    const audio = new File(['audio'], 'audio.wav', { type: 'audio/wav' });
    const text = new File(['text'], 'notes.txt', { type: 'text/plain' });
    const options = createOptions();
    const event = dropEvent({
      types: ['Files'],
      files: [image, text, audio],
    });
    const { result } = renderHook(() =>
      useCanvasMediaDropController(options));

    act(() => result.current.handleCanvasDrop(event));

    expect(options.createUploadNode).toHaveBeenNthCalledWith(1, { x: 100, y: 60 });
    expect(options.createUploadNode).toHaveBeenNthCalledWith(2, { x: 136, y: 96 });
    expect(options.attachExternalFile).toHaveBeenNthCalledWith(1, 'upload-1', image);
    expect(options.attachExternalFile).toHaveBeenNthCalledWith(2, 'upload-2', audio);
    expect(options.selectNode).toHaveBeenCalledWith('upload-2');
    expect(options.spawnAsset).not.toHaveBeenCalled();
  });
});
