// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VideoStoryNodeData } from '../domain/canvasNodeData';
import {
  createUseVideoStoryNodeController,
  type VideoStoryNodeStoreHook,
} from './useVideoStoryNodeController';

const mocks = vi.hoisted(() => ({
  setSelectedNode: vi.fn(),
  updateNodeData: vi.fn(),
  updateNodeInternals: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
  useUpdateNodeInternals: () => mocks.updateNodeInternals,
  NodeToolbar: () => null,
}));

const useVideoStoryNodeController = createUseVideoStoryNodeController({
  useStore: ((selector) =>
    selector({
      setSelectedNode: mocks.setSelectedNode,
      updateNodeData: mocks.updateNodeData,
    })) as VideoStoryNodeStoreHook,
});

function data(patch: Partial<VideoStoryNodeData> = {}): VideoStoryNodeData {
  return {
    displayName: '故事表',
    rows: [
      { shotNumber: 1, visualDescription: '旧画面' },
      { shotNumber: 2, visualDescription: '第二幕' },
    ],
    ...patch,
  };
}

describe('useVideoStoryNodeController', () => {
  beforeEach(() => {
    mocks.setSelectedNode.mockReset();
    mocks.updateNodeData.mockReset();
    mocks.updateNodeInternals.mockReset();
  });

  it('projects node size, title, status, and store commands', () => {
    const nodeData = data();
    const { result } = renderHook(() => useVideoStoryNodeController({
      id: 'story-a',
      data: nodeData,
      selected: true,
      width: 320,
      height: 200,
    }));

    expect(result.current).toMatchObject({
      id: 'story-a',
      selected: true,
      title: '故事表',
      status: 'ready',
      size: {
        width: 480,
        height: 240,
        minWidth: 480,
        minHeight: 240,
        maxWidth: 1600,
        maxHeight: 1200,
      },
    });
    expect(mocks.updateNodeInternals).toHaveBeenCalledWith('story-a');

    act(() => result.current.select());
    act(() => result.current.rename('新标题'));
    expect(mocks.setSelectedNode).toHaveBeenCalledWith('story-a');
    expect(mocks.updateNodeData).toHaveBeenCalledWith('story-a', {
      displayName: '新标题',
    });
  });

  it('preserves status precedence and error fallback', () => {
    const { result, rerender } = renderHook(
      ({ nodeData }: { nodeData: VideoStoryNodeData }) =>
        useVideoStoryNodeController({ id: 'story-a', data: nodeData }),
      {
        initialProps: {
          nodeData: data({
            isAnalyzing: true,
            analysisError: '失败',
            rows: [],
          }),
        },
      },
    );

    expect(result.current.status).toBe('analyzing');
    rerender({ nodeData: data({ analysisError: '失败', rows: [] }) });
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe('失败');
    rerender({ nodeData: data({ rows: [] }) });
    expect(result.current.status).toBe('empty');
    expect(result.current.errorMessage).toBe('未知错误');
  });

  it('writes only changed cells and preserves the other rows', () => {
    const nodeData = data();
    const { result } = renderHook(() => useVideoStoryNodeController({
      id: 'story-a',
      data: nodeData,
    }));

    act(() => result.current.commitCell(0, 'visualDescription', '旧画面'));
    act(() => result.current.commitCell(8, 'visualDescription', '越界'));
    expect(mocks.updateNodeData).not.toHaveBeenCalled();

    act(() => result.current.commitCell(0, 'visualDescription', '新画面'));
    expect(mocks.updateNodeData).toHaveBeenCalledWith('story-a', {
      rows: [
        { shotNumber: 1, visualDescription: '新画面' },
        { shotNumber: 2, visualDescription: '第二幕' },
      ],
    });
  });

  it('opens fullscreen and closes it with Escape', () => {
    const { result } = renderHook(() => useVideoStoryNodeController({
      id: 'story-a',
      data: data(),
    }));

    act(() => result.current.openFullscreen());
    expect(result.current.isFullscreen).toBe(true);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
    })));
    expect(result.current.isFullscreen).toBe(false);
  });
});
