// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { VideoStoryNodeController } from './useVideoStoryNodeController';
import { VideoStoryNodeView } from './VideoStoryNodeView';

vi.mock('react-dom', () => ({
  createPortal: (node: React.ReactNode) => node,
}));

vi.mock('@xyflow/react', () => ({
  Handle: () => <div>handle</div>,
  Position: { Left: 'left' },
}));

vi.mock('./NodeHeader', () => ({
  NODE_HEADER_FLOATING_POSITION_CLASS: 'floating',
  NodeHeader: ({
    titleText,
    onTitleChange,
  }: {
    titleText: string;
    onTitleChange(value: string): void;
  }) => (
    <button type="button" onClick={() => onTitleChange('新标题')}>
      title:{titleText}
    </button>
  ),
}));

vi.mock('./NodeResizeHandle', () => ({
  NodeResizeHandle: () => <div>resize-handle</div>,
}));

vi.mock('./NodeGenerationOverlay', () => ({
  NodeGenerationOverlay: () => <div>generation-overlay</div>,
}));

vi.mock('./EditableTableCell', () => ({
  EditableTableCell: ({
    value,
    onCommit,
  }: {
    value: string;
    onCommit(value: string): void;
  }) => (
    <button type="button" onClick={() => onCommit('编辑后')}>
      cell:{value || 'empty'}
    </button>
  ),
}));

function createController(): VideoStoryNodeController {
  return {
    id: 'story-a',
    selected: true,
    title: '故事表',
    size: {
      width: 720,
      height: 360,
      minWidth: 480,
      minHeight: 240,
      maxWidth: 1600,
      maxHeight: 1200,
    },
    rows: [{
      shotNumber: 1,
      visualDescription: '旧画面',
      keyframeUrl: '/frame.png',
    }],
    status: 'ready',
    errorMessage: '未知错误',
    rawResult: null,
    analysisStartedAt: null,
    isFullscreen: false,
    select: vi.fn(),
    rename: vi.fn(),
    openFullscreen: vi.fn(),
    closeFullscreen: vi.fn(),
    commitCell: vi.fn(),
  } as unknown as VideoStoryNodeController;
}

describe('VideoStoryNodeView', () => {
  it('renders ready rows and forwards node, title, cell, and fullscreen commands', () => {
    const controller = createController();
    const { container } = render(
      <VideoStoryNodeView controller={controller} />,
    );

    expect(screen.getByText('1 条分镜')).toBeInTheDocument();
    expect(screen.getByAltText('keyframe')).toHaveAttribute('src', '/frame.png');
    fireEvent.click(screen.getByRole('button', { name: 'title:故事表' }));
    fireEvent.click(screen.getByRole('button', { name: 'cell:旧画面' }));
    fireEvent.click(screen.getByRole('button', { name: '全屏' }));
    fireEvent.click(container.firstElementChild as HTMLElement);

    expect(controller.rename).toHaveBeenCalledWith('新标题');
    expect(controller.commitCell).toHaveBeenCalledWith(
      0,
      'visualDescription',
      '编辑后',
    );
    expect(controller.openFullscreen).toHaveBeenCalledOnce();
    expect(controller.select).toHaveBeenCalled();
  });

  it('renders analyzing, error, and empty states', () => {
    const controller = createController();
    controller.status = 'analyzing';
    const { rerender } = render(
      <VideoStoryNodeView controller={controller} />,
    );
    expect(screen.getByText('解析中…')).toBeInTheDocument();
    expect(screen.getByText('generation-overlay')).toBeInTheDocument();

    controller.status = 'error';
    controller.errorMessage = '后端解析失败';
    rerender(<VideoStoryNodeView controller={controller} />);
    expect(screen.getAllByText('解析失败')).toHaveLength(2);
    expect(screen.getByText('后端解析失败')).toBeInTheDocument();

    controller.status = 'empty';
    controller.rows = [];
    controller.rawResult = { reason: 'empty' };
    rerender(<VideoStoryNodeView controller={controller} />);
    expect(screen.getAllByText('未识别出分镜')).toHaveLength(2);
    expect(screen.getByText(/"reason": "empty"/)).toBeInTheDocument();
  });

  it('renders the fullscreen table and close command', () => {
    const controller = createController();
    controller.isFullscreen = true;
    render(<VideoStoryNodeView controller={controller} />);

    expect(screen.getByText('共 1 条分镜')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(controller.closeFullscreen).toHaveBeenCalled();
  });
});
