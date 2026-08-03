// Copyright (c) 2026 AI anime
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CanvasAsset } from '@/modules/creative_canvas/public';
import type { GroupNodeController } from '@/features/canvas/hooks/useGroupNodeController';

import { GroupNodeView } from './GroupNodeView';

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div>handle:{id}</div>,
  Position: { Left: 'left', Right: 'right' },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/features/canvas/ui/NodeHeader', () => ({
  NODE_HEADER_FLOATING_POSITION_CLASS: 'floating',
  NodeHeader: ({
    titleText,
    editable,
    onTitleChange,
  }: {
    titleText: string;
    editable: boolean;
    onTitleChange(value: string): void;
  }) => (
    <button type="button" onClick={() => onTitleChange('新标题')}>
      title:{titleText}:{String(editable)}
    </button>
  ),
}));

vi.mock('@/features/canvas/ui/NodeResizeHandle', () => ({
  NodeResizeHandle: ({ visible }: { visible: boolean }) => (
    <div>resize:{String(visible)}</div>
  ),
}));

vi.mock('@/features/canvas/ui/CanvasHistoryAssetsModal', () => ({
  CanvasHistoryAssetsModal: ({
    onClose,
    onUseAsset,
    onDeleteNode,
  }: {
    onClose(): void;
    onUseAsset(asset: CanvasAsset): void;
    onDeleteNode(nodeId: string): void;
  }) => (
    <div>
      <button type="button" onClick={onClose}>history-close</button>
      <button
        type="button"
        onClick={() =>
          onUseAsset({
            id: 'asset-a',
            kind: 'image',
            url: '/history.png',
            previewUrl: null,
            nodeId: 'history-node',
            label: null,
            timestamp: null,
          })
        }
      >
        history-use
      </button>
      <button type="button" onClick={() => onDeleteNode('history-node')}>
        history-delete
      </button>
    </div>
  ),
}));

function createController(): GroupNodeController {
  return {
    id: 'group-a',
    projectId: 'project-a',
    data: {
      label: '分镜组',
      displayName: '分镜组',
      storyboardGroup: true,
      storyboardShowIndex: true,
    },
    selected: true,
    isStoryboard: true,
    showIndex: true,
    headerTitle: '3 个分镜',
    projectionIsStale: true,
    uploading: false,
    addMenuOpen: false,
    addMenuAnchor: null,
    historyOpen: false,
    fileInputRef: createRef<HTMLInputElement>(),
    addMenuRef: createRef<HTMLDivElement>(),
    isDragging: false,
    storyboardCells: [
      {
        index: 0,
        slot: 0,
        preview: {
          nodeId: 'video-a',
          kind: 'video',
          imageUrl: '/poster.jpg',
          label: '视频',
        },
        rect: { x: 12, y: 34, width: 560, height: 315 },
      },
    ],
    emptyCells: [{ x: 580, y: 34, width: 560, height: 315 }],
    floating: null,
    rename: vi.fn(),
    openAddMenu: vi.fn(),
    requestLocalUpload: vi.fn(),
    openHistory: vi.fn(),
    closeHistory: vi.fn(),
    uploadLocalFiles: vi.fn(async () => undefined),
    pickHistoryAsset: vi.fn(),
    deleteHistoryNode: vi.fn(),
    startStoryboardDrag: vi.fn(),
  } as GroupNodeController;
}

describe('GroupNodeView', () => {
  it('renders storyboard cells, stale state, handles, and forwards gestures', () => {
    const controller = createController();
    const { container } = render(<GroupNodeView controller={controller} />);

    expect(screen.getByText('handle:target')).toBeInTheDocument();
    expect(screen.getByText('handle:source')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(
      screen.getByText('freezone.projections.staleBadge'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('.projection-stale-frame'),
    ).not.toBeNull();
    expect(screen.queryByText('resize:true')).not.toBeInTheDocument();

    const preview = container.querySelector(
      'img[src="/poster.jpg"]',
    )?.parentElement as HTMLElement;
    fireEvent.pointerDown(preview, {
      button: 0,
      clientX: 40,
      clientY: 50,
    });
    expect(controller.startStoryboardDrag).toHaveBeenCalledWith(0, {
      x: 40,
      y: 50,
    });

    const emptyCell = container.querySelector(
      'button.nodrag',
    ) as HTMLButtonElement;
    fireEvent.click(emptyCell);
    expect(controller.openAddMenu).toHaveBeenCalledWith({
      cx: 860,
      cy: 191.5,
    });
  });

  it('forwards add-menu, file-input, and history-modal commands', () => {
    const controller = createController();
    controller.addMenuOpen = true;
    controller.addMenuAnchor = { cx: 200, cy: 120 };
    controller.historyOpen = true;
    const { container } = render(<GroupNodeView controller={controller} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'canvas.storyboardGroup.localUpload',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'canvas.storyboardGroup.fromHistory',
      }),
    );
    expect(controller.requestLocalUpload).toHaveBeenCalledOnce();
    expect(controller.openHistory).toHaveBeenCalledOnce();

    const image = new File(['image'], 'frame.png', { type: 'image/png' });
    fireEvent.change(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [image] } },
    );
    expect(controller.uploadLocalFiles).toHaveBeenCalledWith([image]);

    fireEvent.click(screen.getByRole('button', { name: 'history-close' }));
    fireEvent.click(screen.getByRole('button', { name: 'history-use' }));
    fireEvent.click(screen.getByRole('button', { name: 'history-delete' }));
    expect(controller.closeHistory).toHaveBeenCalledOnce();
    expect(controller.pickHistoryAsset).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'asset-a', url: '/history.png' }),
    );
    expect(controller.deleteHistoryNode).toHaveBeenCalledWith('history-node');
  });

  it('renders a plain group with an editable title and resize handle', () => {
    const controller = createController();
    controller.isStoryboard = false;
    controller.showIndex = false;
    controller.storyboardCells = [];
    controller.emptyCells = [];
    controller.projectionIsStale = false;
    render(<GroupNodeView controller={controller} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'title:3 个分镜:true' }),
    );
    expect(controller.rename).toHaveBeenCalledWith('新标题');
    expect(screen.getByText('resize:true')).toBeInTheDocument();
    expect(screen.queryByText('handle:target')).not.toBeInTheDocument();
    expect(screen.queryByText('handle:source')).not.toBeInTheDocument();
  });
});
