// Copyright (c) 2026 AI anime
import { createRef, type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ImageEditNodeController } from '@/features/canvas/hooks/useImageEditNodeController';
import { ImageEditNodeView } from './ImageEditNodeView';

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
      <button type="button" onClick={() => onAspectRatioChange('16:9')}>
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

vi.mock('@/modules/creative_canvas/public', () => ({
  CanvasNodeImage: ({
    src,
    alt,
  }: {
    src: string;
    alt: string;
  }) => (
    <img src={src} alt={alt} />
  ),
  ReferenceDetachButton: ({ nodeId }: { nodeId: string }) => (
    <span>detach:{nodeId}</span>
  ),
  ReferenceTextChip: ({ text }: { text: string }) => <span>text:{text}</span>,
  CANVAS_NODE_INPUT_FRAME_CLASS: 'input-frame',
  CANVAS_NODE_INPUT_PLACEHOLDER_CLASS: 'input-placeholder',
  CANVAS_NODE_INPUT_SURFACE_CLASS: 'input-surface',
  CANVAS_NODE_PANEL_SURFACE_CLASS: 'panel-surface',
  NODE_CONTROL_CHIP_CLASS: 'chip',
  NODE_CONTROL_ICON_CLASS: 'icon',
  NODE_CONTROL_MODEL_CHIP_CLASS: 'model-chip',
  NODE_CONTROL_PARAMS_CHIP_CLASS: 'params-chip',
  NODE_CONTROL_PRIMARY_BUTTON_CLASS: 'primary-button',
  IMAGE_EDIT_NODE_SIZE_LIMITS: {
    minWidth: 240,
    minHeight: 180,
    maxWidth: 1400,
    maxHeight: 1400,
  },
  canvasNodeFrameClass: () => 'frame-class',
  NodePriceBadge: ({ label }: { label: string }) => <div>price:{label}</div>,
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
    <div>resize:{minWidth}:{minHeight}:{maxWidth}:{maxHeight}</div>
  ),
  projectImageEditPromptSegments: (prompt: string) => [
    { kind: 'text', text: prompt, start: 0 },
  ],
  stringifyParamValue: (value: unknown) => String(value),
  resolveImageDisplayUrl: (url: string) => url,
  AssetLibraryModal: ({
    open,
    onClose,
    onConfirm,
  }: {
    open: boolean;
    onClose(): void;
    onConfirm(value: Array<{ media: 'image'; url: string; name: string }>): void;
  }) =>
    open ? (
      <div>
        <button type="button" onClick={onClose}>
          close-assets
        </button>
        <button
          type="button"
          onClick={() =>
            onConfirm([{ media: 'image', url: '/asset.png', name: '资产' }])
          }
        >
          confirm-assets
        </button>
      </div>
    ) : null,
}));

vi.mock('@/components/ui', () => ({
  UiButton: ({
    children,
    variant: _variant,
    ...props
  }: {
    children: ReactNode;
    variant?: string;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

function createController(): ImageEditNodeController {
  return {
    data: {
      prompt: '增强 @图1',
      model: 'model-a',
      size: '1K',
      requestAspectRatio: '1:1',
      extraParams: { quality: 'high' },
      imageUrl: null,
      aspectRatio: '1:1',
    },
    selected: true,
    title: 'AI 改图',
    size: { width: 640, height: 520 },
    rootRef: createRef<HTMLDivElement>(),
    promptRef: createRef<HTMLTextAreaElement>(),
    promptHighlightRef: createRef<HTMLDivElement>(),
    promptDraft: '增强 @图1',
    incomingImages: ['/reference.png'],
    upstreamTextContents: [
      {
        nodeId: 'text-a',
        nodeType: 'text',
        displayName: '上游文本',
        text: '场景描述',
      },
    ],
    incomingImageItems: [
      {
        imageUrl: '/reference.png',
        displayUrl: '/reference.png',
        viewerUrl: '/reference.png',
        label: '图1',
        sourceNodeId: 'upload-a',
      },
    ],
    incomingImageViewerList: ['/reference.png'],
    detachUpstream: vi.fn(),
    generationMode: 'all_reference',
    generationModeChoices: [
      { key: 'text_to_image', label: '文生图', disabled: true },
      { key: 'all_reference', label: '全能参考', disabled: false },
    ],
    capability: null,
    structuredCapabilities: [],
    imageModels: [] as never,
    selectedModel: { id: 'model-a' } as never,
    resolutionOptions: [] as never,
    selectedResolution: { value: '1K', label: '1K' } as never,
    aspectRatioOptions: [{ value: '1:1', label: '1:1' }],
    selectedAspectRatio: { value: '1:1', label: '1:1' },
    resolvedPriceDisplay: null,
    resolvedPriceTooltip: undefined,
    showWebSearchToggle: false,
    webSearchEnabled: false,
    showImagePicker: false,
    pickerActiveIndex: 0,
    pickerAnchor: { left: 8, top: 8 },
    isAssetLibraryOpen: false,
    assetLibraryProject: 'project-a',
    error: null,
    copy: {
      promptPlaceholder: '输入提示词',
      generate: '生成',
    },
    select: vi.fn(),
    rename: vi.fn(),
    focusPrompt: vi.fn(),
    applyPromptSuggestion: vi.fn(),
    selectGenerationMode: vi.fn(),
    selectCapability: vi.fn(),
    clearCapability: vi.fn(),
    updateCapabilityParam: vi.fn(),
    changePrompt: vi.fn(),
    handlePromptKeyDown: vi.fn(),
    handlePromptDoubleClick: vi.fn(),
    syncPromptHighlightScroll: vi.fn(),
    insertImageReference: vi.fn(),
    activatePickerItem: vi.fn(),
    openAssetLibrary: vi.fn(),
    closeAssetLibrary: vi.fn(),
    confirmAssetLibrarySelections: vi.fn(),
    changeModel: vi.fn(),
    changeResolution: vi.fn(),
    changeAspectRatio: vi.fn(),
    changeExtraParam: vi.fn(),
    toggleWebSearch: vi.fn(),
    generate: vi.fn(),
  } as unknown as ImageEditNodeController;
}

describe('ImageEditNodeView', () => {
  it('renders projected references and forwards node, prompt, and generation commands', () => {
    const controller = createController();
    controller.resolvedPriceDisplay = { label: '3 点' } as never;
    controller.error = '生成失败';
    render(<ImageEditNodeView controller={controller} />);

    fireEvent.click(screen.getByRole('button', { name: 'title:AI 改图' }));
    fireEvent.click(screen.getByRole('button', { name: '标记' }));
    fireEvent.click(screen.getByRole('button', { name: '运镜' }));
    fireEvent.click(screen.getByRole('button', { name: '资产库' }));
    fireEvent.click(screen.getByRole('button', { name: '生成' }));

    expect(screen.getAllByAltText('图1')).toHaveLength(2);
    expect(screen.getByText('text:场景描述')).toBeInTheDocument();
    expect(screen.getByText('price:3 点')).toBeInTheDocument();
    expect(screen.getByText('生成失败')).toBeInTheDocument();
    expect(controller.rename).toHaveBeenCalledWith('新标题');
    expect(controller.focusPrompt).toHaveBeenCalled();
    expect(controller.applyPromptSuggestion).toHaveBeenCalledWith(
      expect.stringContaining('镜头运动'),
    );
    expect(controller.openAssetLibrary).toHaveBeenCalled();
    expect(controller.generate).toHaveBeenCalled();
  });

  it('forwards mode, capability, picker, prompt, model, and asset commands', () => {
    const controller = createController();
    const capability = {
      id: 'repair',
      name: '肖像修复',
      shortName: '修复',
      params: [
        {
          key: 'style',
          label: '风格',
          type: 'enum',
          defaultValue: 'clean',
          options: [{ value: 'clean', label: '干净' }],
        },
      ],
    } as never;
    controller.capability = capability;
    controller.structuredCapabilities = [capability];
    controller.showImagePicker = true;
    controller.isAssetLibraryOpen = true;
    render(<ImageEditNodeView controller={controller} />);

    fireEvent.click(screen.getByRole('button', { name: '全能参考' }));
    fireEvent.click(screen.getByRole('button', { name: '修复⚙' }));
    fireEvent.click(screen.getByRole('button', { name: '自由提示词' }));
    const pickerImages = screen.getAllByAltText('图1');
    const pickerImage = pickerImages[pickerImages.length - 1];
    fireEvent.mouseEnter(pickerImage.closest('button') as HTMLElement);
    fireEvent.click(pickerImage.closest('button') as HTMLElement);
    const textarea = screen.getByDisplayValue('增强 @图1');
    fireEvent.change(textarea, { target: { value: '新提示词' } });
    fireEvent.keyDown(textarea, { key: '@' });
    fireEvent.doubleClick(textarea);
    fireEvent.scroll(textarea);
    fireEvent.click(screen.getByRole('button', { name: 'model-control' }));
    fireEvent.click(screen.getByRole('button', { name: 'resolution-control' }));
    fireEvent.click(screen.getByRole('button', { name: 'ratio-control' }));
    fireEvent.click(screen.getByRole('button', { name: 'extra-control' }));
    fireEvent.click(screen.getByRole('button', { name: 'close-assets' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm-assets' }));

    expect(controller.selectGenerationMode).toHaveBeenCalledWith(
      'all_reference',
    );
    expect(controller.selectCapability).toHaveBeenCalledWith(capability);
    expect(controller.clearCapability).toHaveBeenCalled();
    expect(controller.activatePickerItem).toHaveBeenCalledWith(0);
    expect(controller.insertImageReference).toHaveBeenCalledWith(0);
    expect(controller.changePrompt).toHaveBeenCalledWith('新提示词');
    expect(controller.handlePromptKeyDown).toHaveBeenCalledWith(
      expect.objectContaining({ key: '@' }),
    );
    expect(controller.handlePromptDoubleClick).toHaveBeenCalled();
    expect(controller.syncPromptHighlightScroll).toHaveBeenCalled();
    expect(controller.changeModel).toHaveBeenCalledWith('model-b');
    expect(controller.changeResolution).toHaveBeenCalledWith('2K');
    expect(controller.changeAspectRatio).toHaveBeenCalledWith('16:9');
    expect(controller.changeExtraParam).toHaveBeenCalledWith('quality', 'low');
    expect(controller.closeAssetLibrary).toHaveBeenCalled();
    expect(controller.confirmAssetLibrarySelections).toHaveBeenCalledWith([
      { media: 'image', url: '/asset.png', name: '资产' },
    ]);
  });
});
