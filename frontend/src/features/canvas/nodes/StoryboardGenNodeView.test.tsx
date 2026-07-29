// Copyright (c) 2026 AI anime
import { createRef, type ReactNode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { StoryboardGenNodeController } from '@/features/canvas/hooks/useStoryboardGenNodeController';

import { StoryboardGenNodeView } from './StoryboardGenNodeView';

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div>handle:{id}</div>,
  Position: { Left: 'left', Right: 'right' },
}));

vi.mock('@/features/canvas/ui/NodeHeader', () => ({
  NODE_HEADER_FLOATING_POSITION_CLASS: 'floating',
  NodeHeader: ({
    titleText,
    onTitleChange,
    rightSlot,
  }: {
    titleText: string;
    onTitleChange(value: string): void;
    rightSlot?: ReactNode;
  }) => (
    <div>
      <button type="button" onClick={() => onTitleChange('新标题')}>
        title:{titleText}
      </button>
      {rightSlot}
    </div>
  ),
}));

vi.mock('@/features/canvas/ui/NodePriceBadge', () => ({
  NodePriceBadge: ({ label }: { label: string }) => <div>price:{label}</div>,
}));

vi.mock('@/features/canvas/ui/NodeResizeHandle', () => ({
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

vi.mock('@/features/canvas/ui/ModelParamsControls', () => ({
  ModelParamsControls: ({
    onModelChange,
    onResolutionChange,
    onAspectRatioChange,
    onExtraParamChange,
  }: {
    onModelChange(value: string): void;
    onResolutionChange(value: string): void;
    onAspectRatioChange(value: string): void;
    onExtraParamChange(key: string, value: unknown): void;
  }) => (
    <div>
      <button type="button" onClick={() => onModelChange('model-b')}>
        model-control
      </button>
      <button type="button" onClick={() => onResolutionChange('2K')}>
        resolution-control
      </button>
      <button type="button" onClick={() => onAspectRatioChange('1:1')}>
        ratio-control
      </button>
      <button
        type="button"
        onClick={() => onExtraParamChange('quality', 'low')}
      >
        extra-control
      </button>
    </div>
  ),
}));

vi.mock('@/components/credits/credit-visual', () => ({
  CreditSparkIcon: () => <span>credit-icon</span>,
}));

vi.mock('@/components/ui', () => ({
  UiButton: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: {
    children: ReactNode;
    variant?: string;
    size?: string;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

function createController(): StoryboardGenNodeController {
  return {
    id: 'storyboard-a',
    data: {
      displayName: '多版本宫格',
      gridRows: 1,
      gridCols: 1,
      frames: [
        {
          id: 'frame-a',
          description: '主角 @图1',
          referenceIndex: 0,
        },
      ],
      model: 'model-a',
      size: '1K',
      requestAspectRatio: '16:9',
      imageUrl: null,
      aspectRatio: '1:1',
    },
    selected: true,
    title: '多版本宫格',
    copy: {
      rowsShort: '行',
      colsShort: '列',
      ratioModeOverall: '整体比例',
      ratioModeCell: '单格比例',
      frameCount: '1 格',
      cellAspectRatio: '单格',
      overallAspectRatio: '整体',
      framePlaceholders: ['格 01 描述'],
      generate: '生成',
    },
    layout: {
      baseSize: { width: 470, height: 470 },
      size: { width: 600, height: 550 },
      cellWidth: 300,
      gridWidth: 300,
      paramsRowWidth: 576,
      cellAspectRatioCss: '16 / 9',
    },
    totalFrames: 1,
    showAdvancedRatioControls: false,
    ratioControlMode: 'cell',
    resolvedAspectRatios: {
      cellRatioValue: 16 / 9,
      overallRatioValue: 16 / 9,
      cellAspectRatio: '16:9',
      overallAspectRatio: '16:9',
      cellAspectRatioLabel: '16:9',
      overallAspectRatioLabel: '16:9',
    },
    frameDescriptionDrafts: { 'frame-a': '主角 @图1' },
    incomingImages: ['/reference.png'],
    incomingImageItems: [
      {
        imageUrl: '/reference.png',
        displayUrl: '/reference.png',
        viewerUrl: '/reference.png',
        label: '图1',
      },
    ],
    incomingImageViewerList: ['/reference.png'],
    showImagePicker: false,
    pickerActiveIndex: 0,
    pickerAnchor: { left: 20, top: 30 },
    error: null,
    rootRef: createRef<HTMLDivElement>(),
    imageModels: [],
    selectedModel: {} as never,
    resolutionOptions: [],
    selectedResolution: { value: '1K', label: '1K' },
    selectedAspectRatio: { value: '16:9', label: '16:9' },
    aspectRatioOptions: [{ value: '16:9', label: '16:9' }],
    resolvedPriceDisplay: null,
    resolvedPriceTooltip: undefined,
    effectiveExtraParams: {},
    showWebSearchToggle: false,
    webSearchEnabled: false,
    select: vi.fn(),
    rename: vi.fn(),
    adjustRows: vi.fn(),
    adjustCols: vi.fn(),
    setRatioControlMode: vi.fn(),
    changeFrameDescription: vi.fn(),
    setFrameTextareaRef: vi.fn(),
    setFrameHighlightRef: vi.fn(),
    syncFrameHighlightScroll: vi.fn(),
    captureFramePointer: vi.fn(),
    focusFrame: vi.fn(),
    handleFrameKeyDown: vi.fn(),
    insertImageReference: vi.fn(),
    activatePickerItem: vi.fn(),
    changeModel: vi.fn(),
    changeResolution: vi.fn(),
    changeAspectRatio: vi.fn(),
    changeExtraParam: vi.fn(),
    toggleWebSearch: vi.fn(),
    generateFromModifiers: vi.fn(async () => undefined),
  } as unknown as StoryboardGenNodeController;
}

describe('StoryboardGenNodeView', () => {
  it('renders projected geometry and forwards selection, title, and frame edits', () => {
    const controller = createController();
    const { container } = render(
      <StoryboardGenNodeView controller={controller} />,
    );

    expect(screen.getByText('主角')).toBeInTheDocument();
    expect(screen.getByText('@图1')).toBeInTheDocument();
    expect(screen.getByText('1 格')).toBeInTheDocument();
    expect(screen.getByText('handle:target')).toBeInTheDocument();
    expect(screen.getByText('handle:source')).toBeInTheDocument();
    expect(screen.getByText('resize:470:470:1800:1400')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'title:多版本宫格' }));
    fireEvent.change(screen.getByDisplayValue('主角 @图1'), {
      target: { value: '新描述' },
    });
    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(controller.rename).toHaveBeenCalledWith('新标题');
    expect(controller.changeFrameDescription).toHaveBeenCalledWith(
      0,
      '新描述',
    );
    expect(controller.select).toHaveBeenCalled();
  });

  it('renders advanced ratios and the image picker as command-only UI', () => {
    const controller = createController();
    controller.showAdvancedRatioControls = true;
    controller.ratioControlMode = 'overall';
    controller.showImagePicker = true;
    render(<StoryboardGenNodeView controller={controller} />);

    fireEvent.click(screen.getByRole('button', { name: '整体比例' }));
    fireEvent.click(screen.getByRole('button', { name: '单格比例' }));
    const pickerButton = screen.getByRole('button', { name: /图1/ });
    fireEvent.mouseEnter(pickerButton);
    fireEvent.click(pickerButton);
    const textarea = screen.getByDisplayValue('主角 @图1');
    fireEvent.keyDown(textarea, { key: '@' });
    fireEvent.pointerDown(textarea, { clientX: 120, clientY: 80 });
    fireEvent.focus(textarea);
    fireEvent.scroll(textarea);

    expect(controller.setRatioControlMode).toHaveBeenNthCalledWith(
      1,
      'overall',
    );
    expect(controller.setRatioControlMode).toHaveBeenNthCalledWith(2, 'cell');
    expect(controller.activatePickerItem).toHaveBeenCalledWith(0);
    expect(controller.insertImageReference).toHaveBeenCalledWith(0);
    expect(controller.handleFrameKeyDown).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ key: '@' }),
    );
    expect(controller.captureFramePointer).toHaveBeenCalledWith(
      0,
      120,
      80,
    );
    expect(controller.focusFrame).toHaveBeenCalledWith(
      'frame-a',
      expect.anything(),
    );
    expect(controller.syncFrameHighlightScroll).toHaveBeenCalledWith(
      'frame-a',
    );
  });

  it('forwards grid, model, and modifier-aware generation commands', () => {
    const controller = createController();
    controller.error = '生成失败';
    controller.resolvedPriceDisplay = { label: '3 点' } as never;
    render(<StoryboardGenNodeView controller={controller} />);

    const rowControl = screen.getByText('行').parentElement as HTMLElement;
    const colControl = screen.getByText('列').parentElement as HTMLElement;
    fireEvent.click(within(rowControl).getAllByRole('button')[0]);
    fireEvent.click(within(rowControl).getAllByRole('button')[1]);
    fireEvent.click(within(colControl).getAllByRole('button')[0]);
    fireEvent.click(within(colControl).getAllByRole('button')[1]);
    fireEvent.click(screen.getByRole('button', { name: 'model-control' }));
    fireEvent.click(screen.getByRole('button', { name: 'resolution-control' }));
    fireEvent.click(screen.getByRole('button', { name: 'ratio-control' }));
    fireEvent.click(screen.getByRole('button', { name: 'extra-control' }));
    fireEvent.click(screen.getByRole('button', { name: /生成/ }), {
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
    });

    expect(controller.adjustRows).toHaveBeenNthCalledWith(1, -1);
    expect(controller.adjustRows).toHaveBeenNthCalledWith(2, 1);
    expect(controller.adjustCols).toHaveBeenNthCalledWith(1, -1);
    expect(controller.adjustCols).toHaveBeenNthCalledWith(2, 1);
    expect(controller.changeModel).toHaveBeenCalledWith('model-b');
    expect(controller.changeResolution).toHaveBeenCalledWith('2K');
    expect(controller.changeAspectRatio).toHaveBeenCalledWith('1:1');
    expect(controller.changeExtraParam).toHaveBeenCalledWith('quality', 'low');
    expect(controller.generateFromModifiers).toHaveBeenCalledWith({
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
    });
    expect(screen.getByText('price:3 点')).toBeInTheDocument();
    expect(screen.getByText('生成失败')).toBeInTheDocument();
  });
});
