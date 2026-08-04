// Copyright (c) 2026 AI anime
import { createRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { StoryboardNodeController } from '@/features/canvas/hooks/useStoryboardNodeController';

import { StoryboardNodeView } from './StoryboardNodeView';

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

vi.mock('@/modules/creative_canvas/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/creative_canvas/public')>()),
  NodeResizeHandle: ({
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
  }: {
    minWidth: number;
    minHeight: number;
    maxWidth: number;
    maxHeight: number;
  }) => (
    <div>
      resize:{minWidth}:{minHeight}:{maxWidth}:{maxHeight}
    </div>
  ),
}));

vi.mock('@/features/canvas/ui/CanvasNodeImage', () => ({
  CanvasNodeImage: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));

vi.mock('@/components/ui', () => ({
  UiButton: ({
    children,
    size: _size,
    variant: _variant,
    ...props
  }: {
    children: ReactNode;
    size?: string;
    variant?: string;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  UiChipButton: ({
    children,
    active: _active,
    ...props
  }: {
    children: ReactNode;
    active?: boolean;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  UiCheckbox: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked: boolean;
    onCheckedChange(value: boolean): void;
  } & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'>) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange(event.target.checked)}
      {...props}
    />
  ),
  UiInput: (props: InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
  UiPanel: ({ children, ...props }: { children: ReactNode }) => (
    <section {...props}>{children}</section>
  ),
  UiSelect: (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props} />
  ),
}));

function createController(): StoryboardNodeController {
  return {
    id: 'storyboard-a',
    data: {
      displayName: '分镜拆分结果',
      aspectRatio: '16:9',
      frameAspectRatio: '16:9',
      gridRows: 1,
      gridCols: 2,
      frames: [],
    },
    selected: true,
    title: '分镜拆分结果',
    projection: {
      orderedFrames: [
        {
          id: 'first',
          imageUrl: '/first.png',
          previewImageUrl: '/first-preview.png',
          note: '第一格',
          order: 0,
        },
        {
          id: 'empty',
          imageUrl: null,
          note: '',
          order: 1,
        },
      ],
      frameAspectRatio: '16:9',
      frameAspectRatioCss: '16 / 9',
      gridCols: 2,
      gridRows: 1,
      totalFrames: 2,
      size: { width: 500, height: 400 },
      exportOptions: {
        showFrameIndex: false,
        showFrameNote: false,
        notePlacement: 'overlay',
        imageFit: 'cover',
        frameIndexPrefix: 'S',
        cellGap: 8,
        outerPadding: 0,
        fontSize: 4,
        backgroundColor: '#0f1115',
        textColor: '#f8fafc',
      },
    },
    preferOriginalImage: false,
    incomingImageItems: [
      {
        imageUrl: '/input.png',
        previewImageUrl: '/input-preview.png',
        displayUrl: '/input-preview.png',
        viewerUrl: '/input.png',
        label: '图1',
      },
    ],
    frameViewerImageList: ['/first.png'],
    incomingImageViewerList: ['/input.png'],
    rootRef: createRef<HTMLDivElement>(),
    pickerMenuRef: createRef<HTMLDivElement>(),
    draggedFrameId: null,
    dropTargetFrameId: null,
    pickerState: null,
    isExporting: false,
    isPackingSingleImages: false,
    isAnyExporting: false,
    exportError: null,
    isExportPanelOpen: false,
    select: vi.fn(),
    rename: vi.fn(),
    updateFrameNote: vi.fn(),
    patchExportOptions: vi.fn(),
    startSort: vi.fn(),
    hoverSortTarget: vi.fn(),
    editFrame: vi.fn(async () => undefined),
    exportGrid: vi.fn(async () => undefined),
    packSingleImages: vi.fn(async () => undefined),
    togglePicker: vi.fn(),
    replaceFromInput: vi.fn(),
    toggleExportPanel: vi.fn(),
  } as unknown as StoryboardNodeController;
}

describe('StoryboardNodeView', () => {
  it('renders frames and forwards selection, title, and note commands', () => {
    const controller = createController();
    const { container } = render(<StoryboardNodeView controller={controller} />);

    expect(screen.getByAltText('Frame 1')).toHaveAttribute(
      'src',
      '/first-preview.png',
    );
    expect(screen.getByText('空格')).toBeInTheDocument();
    expect(screen.getByText('1 x 2 | 2 格')).toBeInTheDocument();
    expect(screen.getByText('handle:target')).toBeInTheDocument();
    expect(screen.getByText('handle:source')).toBeInTheDocument();
    expect(screen.getByText('resize:440:320:1800:1600')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'title:分镜拆分结果' }));
    fireEvent.change(screen.getByDisplayValue('第一格'), {
      target: { value: '新描述' },
    });
    fireEvent.click(container.firstElementChild as HTMLElement);

    expect(controller.rename).toHaveBeenCalledWith('新标题');
    expect(controller.updateFrameNote).toHaveBeenCalledWith(
      'first',
      '新描述',
    );
    expect(controller.select).toHaveBeenCalled();
  });

  it('renders the input picker and export settings as command-only UI', () => {
    const controller = createController();
    controller.pickerState = { frameId: 'first', x: 100, y: 200 };
    controller.isExportPanelOpen = true;
    render(<StoryboardNodeView controller={controller} />);

    fireEvent.click(screen.getByRole('button', { name: /图1/ }));
    fireEvent.click(screen.getByLabelText('显示格序号'));
    fireEvent.change(screen.getByLabelText('图片填充'), {
      target: { value: 'contain' },
    });
    fireEvent.change(screen.getByLabelText('字号(%)'), {
      target: { value: '7' },
    });

    expect(controller.replaceFromInput).toHaveBeenCalledWith(
      'first',
      '/input.png',
    );
    expect(controller.patchExportOptions).toHaveBeenCalledWith({
      showFrameIndex: true,
    });
    expect(controller.patchExportOptions).toHaveBeenCalledWith({
      imageFit: 'contain',
    });
    expect(controller.patchExportOptions).toHaveBeenCalledWith({
      fontSize: 7,
    });
  });

  it('forwards drag, edit, picker, and export actions and renders errors', () => {
    const controller = createController();
    controller.exportError = '导出失败';
    render(<StoryboardNodeView controller={controller} />);

    const image = screen.getByAltText('Frame 1');
    fireEvent.pointerDown(image.parentElement as HTMLElement, { button: 0 });
    fireEvent.pointerEnter(image.parentElement?.parentElement as HTMLElement);
    fireEvent.click(screen.getAllByTitle('单独编辑此格')[0]);
    fireEvent.click(screen.getAllByTitle('从输入图片替换')[0]);
    fireEvent.click(screen.getByRole('button', { name: /导出设置/ }));
    fireEvent.click(screen.getByRole('button', { name: /打包下载/ }));
    fireEvent.click(screen.getByRole('button', { name: /合并宫格/ }));

    expect(controller.startSort).toHaveBeenCalledWith('first');
    expect(controller.hoverSortTarget).toHaveBeenCalledWith('first');
    expect(controller.editFrame).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'first' }),
    );
    expect(controller.togglePicker).toHaveBeenCalledWith(
      'first',
      expect.any(Number),
      expect.any(Number),
    );
    expect(controller.toggleExportPanel).toHaveBeenCalledOnce();
    expect(controller.packSingleImages).toHaveBeenCalledOnce();
    expect(controller.exportGrid).toHaveBeenCalledOnce();
    expect(screen.getByText('导出失败')).toBeInTheDocument();
  });
});
