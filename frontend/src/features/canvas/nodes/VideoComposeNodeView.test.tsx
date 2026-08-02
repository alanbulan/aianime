// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ComposeTimelineState } from '@/modules/creative_canvas/public';
import type { VideoComposeNodeController } from '@/features/canvas/hooks/useVideoComposeNodeController';

import { VideoComposeNodeView } from './VideoComposeNodeView';

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div>handle:{id}</div>,
  Position: { Left: 'left', Right: 'right' },
}));

vi.mock('@/features/canvas/ui/NodeHeader', () => ({
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

vi.mock('@/modules/creative_canvas/public', () => ({
  VideoComposeModal: ({
    project,
    canvasId,
    seedNodeIds,
    sourceMedia,
    resolveMediaUrl,
    onPersistDraft,
    onClose,
    onComposed,
  }: {
    project: string;
    canvasId: string;
    seedNodeIds: string[];
    sourceMedia: readonly unknown[];
    resolveMediaUrl(url: string): string;
    onPersistDraft(timeline: ComposeTimelineState): void;
    onClose(): void;
    onComposed(url: string, coverUrl: string | null): void;
  }) => (
    <div>
      <span>
        modal:{project}:{canvasId}:{seedNodeIds.join(',')}:{sourceMedia.length}:{resolveMediaUrl('/clip.mp4')}
      </span>
      <button type="button" onClick={() => onPersistDraft({
        tracks: [],
        resolution: '720p',
      })}>persist</button>
      <button type="button" onClick={onClose}>close</button>
      <button type="button" onClick={() => onComposed(
        '/result.mp4',
        '/cover.jpg',
      )}>compose</button>
    </div>
  ),
}));

function createController(): VideoComposeNodeController {
  return {
    id: 'compose-a',
    data: {},
    selected: true,
    title: '视频合成',
    size: { width: 240, height: 136 },
    seedNodeIds: ['video-a', 'video-b'],
    sourceMedia: [],
    videoCount: 2,
    canOpen: true,
    isEditorOpen: false,
    project: 'project-a',
    canvasId: 'canvas-a',
    initialTimeline: null,
    openLabel: '打开编辑器',
    hintText: '至少连接 2 个视频',
    select: vi.fn(),
    rename: vi.fn(),
    openEditor: vi.fn(),
    closeEditor: vi.fn(),
    persistDraft: vi.fn(),
    completeComposition: vi.fn(),
  } as VideoComposeNodeController;
}

describe('VideoComposeNodeView', () => {
  it('renders the node and forwards title, open, and select commands', () => {
    const controller = createController();
    const { container } = render(
      <VideoComposeNodeView controller={controller} />,
    );

    expect(screen.getByText('handle:target')).toBeInTheDocument();
    expect(screen.getByText('handle:source')).toBeInTheDocument();
    expect(screen.getByText('至少连接 2 个视频')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'title:视频合成' }));
    fireEvent.click(screen.getByRole('button', { name: '打开编辑器' }));
    fireEvent.click(container.firstElementChild as HTMLElement);

    expect(controller.rename).toHaveBeenCalledWith('新标题');
    expect(controller.openEditor).toHaveBeenCalledOnce();
    expect(controller.select).toHaveBeenCalled();
  });

  it('keeps the editor button disabled below the video minimum', () => {
    const controller = createController();
    controller.canOpen = false;
    render(<VideoComposeNodeView controller={controller} />);

    expect(screen.getByRole('button', { name: '打开编辑器' })).toBeDisabled();
  });

  it('forwards modal draft, close, and composition commands', () => {
    const controller = createController();
    controller.isEditorOpen = true;
    render(<VideoComposeNodeView controller={controller} />);

    expect(screen.getByText(
      'modal:project-a:canvas-a:video-a,video-b:0:/clip.mp4',
    )).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'persist' }));
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    fireEvent.click(screen.getByRole('button', { name: 'compose' }));

    expect(controller.persistDraft).toHaveBeenCalledWith({
      tracks: [],
      resolution: '720p',
    });
    expect(controller.closeEditor).toHaveBeenCalledOnce();
    expect(controller.completeComposition).toHaveBeenCalledWith(
      '/result.mp4',
      '/cover.jpg',
    );
  });
});
