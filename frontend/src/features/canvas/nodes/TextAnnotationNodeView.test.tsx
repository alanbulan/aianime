// Copyright (c) 2026 AI anime
import { createRef, type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TextAnnotationNodeController } from '@/features/canvas/hooks/useTextAnnotationNodeController';

import { TextAnnotationNodeView } from './TextAnnotationNodeView';

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div>handle:{id}</div>,
  Position: { Left: 'left', Right: 'right' },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div>markdown:{children}</div>
  ),
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

vi.mock('@/modules/creative_canvas/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/creative_canvas/public')>()),
  NodeResizeHandle: ({ minWidth, minHeight }: {
    minWidth: number;
    minHeight: number;
  }) => <div>resize:{minWidth}:{minHeight}</div>,
}));

vi.mock('@/features/canvas/ui/NodeGenerationOverlay', () => ({
  NodeGenerationOverlay: ({ durationMs }: { durationMs: number }) => (
    <div>generation-overlay:{durationMs}</div>
  ),
}));

vi.mock('@/features/canvas/ui/ProviderModelPicker', () => ({
  ProviderModelPicker: ({
    selectedModelId,
    onChange,
  }: {
    selectedModelId: string;
    onChange(value: string): void;
  }) => (
    <button type="button" onClick={() => onChange('model-b')}>
      model:{selectedModelId}
    </button>
  ),
}));

vi.mock('@/components/credit-cost-inline', () => ({
  CreditCostInline: ({ display }: { display?: string }) => (
    <div>credit:{display}</div>
  ),
}));

function createController(): TextAnnotationNodeController {
  return {
    id: 'text-a',
    projectId: 'project-a',
    data: {
      label: '文本节点',
      displayName: '文本节点',
      content: '正文',
      generationStartedAt: null,
    },
    selected: true,
    content: '正文',
    mode: 'writing',
    pickerDismissed: false,
    modelId: 'model-a',
    title: '文本节点',
    size: {
      width: 440,
      height: 240,
      minWidth: 380,
      minHeight: 240,
      maxWidth: 900,
      maxHeight: 1200,
    },
    isGenerating: false,
    isSystemManaged: false,
    isCompactView: false,
    isEditingContent: false,
    isTranslating: false,
    editTextareaRef: createRef<HTMLTextAreaElement>(),
    upstreamImageDisplayUrl: null,
    textPlaceholder: 'node.textNode.placeholder',
    hasUserContent: true,
    submitDisabled: false,
    reversePromptCostDisplay: '2 credits',
    reversePromptDurationMs: 15000,
    compactInputValue: '正文',
    compactInputPlaceholder: 'node.textNode.placeholder',
    showWritingOpsPanel: true,
    showCompactOpsPanel: false,
    translateDisabled: false,
    select: vi.fn(),
    rename: vi.fn(),
    changeContent: vi.fn(),
    changeCompactInput: vi.fn(),
    changeModel: vi.fn(),
    detachUpstreamImage: vi.fn(),
    enterEditMode: vi.fn(),
    finishEditing: vi.fn(),
    cancelEditing: vi.fn(),
    selectMode: vi.fn(),
    submit: vi.fn(),
    translate: vi.fn(async () => undefined),
  } as TextAnnotationNodeController;
}

describe('TextAnnotationNodeView', () => {
  it('renders writing markdown and forwards node, title, edit, and translate commands', () => {
    const controller = createController();
    const { container } = render(
      <TextAnnotationNodeView controller={controller} />,
    );

    expect(screen.getByText('handle:target')).toBeInTheDocument();
    expect(screen.getByText('handle:source')).toBeInTheDocument();
    expect(screen.getByText('resize:380:240')).toBeInTheDocument();
    expect(screen.getByText('markdown:正文')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'title:文本节点:true' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'node.textNode.translate' }),
    );
    fireEvent.click(container.firstElementChild as HTMLElement);
    fireEvent.doubleClick(
      screen.getByText('markdown:正文').closest('.flex') as HTMLElement,
    );

    expect(controller.rename).toHaveBeenCalledWith('新标题');
    expect(controller.translate).toHaveBeenCalledOnce();
    expect(controller.select).toHaveBeenCalled();
    expect(controller.enterEditMode).toHaveBeenCalledOnce();
  });

  it('renders all capability modes and forwards the selected mode', () => {
    const controller = createController();
    controller.content = '';
    controller.data.content = '';
    controller.hasUserContent = false;
    controller.showWritingOpsPanel = false;
    render(<TextAnnotationNodeView controller={controller} />);

    expect(screen.getByText('node.textNode.tryHint')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'node.textNode.modes.textToVideo',
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'node.textNode.modes.imageToPrompt',
      }),
    );
    expect(controller.selectMode).toHaveBeenCalledWith('imageToPrompt');
  });

  it('renders compact reverse-prompt controls and forwards their commands', () => {
    const controller = createController();
    controller.mode = 'imageToPrompt';
    controller.isCompactView = true;
    controller.showWritingOpsPanel = false;
    controller.showCompactOpsPanel = true;
    controller.upstreamImageDisplayUrl = 'display:/reference.jpg';
    controller.compactInputValue = '';
    controller.compactInputPlaceholder = '反推提示词要求';
    controller.isGenerating = true;
    controller.data.generationStartedAt = 100;
    const { container } = render(
      <TextAnnotationNodeView controller={controller} />,
    );

    expect(screen.getByText('generation-overlay:15000')).toBeInTheDocument();
    expect(screen.getByText('credit:2 credits')).toBeInTheDocument();
    expect(
      container.querySelector('img[src="display:/reference.jpg"]'),
    ).not.toBeNull();

    fireEvent.change(
      screen.getByPlaceholderText('反推提示词要求'),
      { target: { value: '突出镜头语言' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: '取消引用此素材' }),
    );
    expect(controller.changeCompactInput).toHaveBeenCalledWith(
      '突出镜头语言',
    );
    expect(controller.detachUpstreamImage).toHaveBeenCalledOnce();
  });

  it('forwards editor changes, Escape, blur, and dismissed-placeholder entry', () => {
    const controller = createController();
    controller.isEditingContent = true;
    controller.showWritingOpsPanel = false;
    const { rerender } = render(
      <TextAnnotationNodeView controller={controller} />,
    );
    const editor = screen.getByDisplayValue('正文');
    fireEvent.change(editor, { target: { value: '编辑后正文' } });
    fireEvent.keyDown(editor, { key: 'Escape' });
    fireEvent.blur(editor);
    expect(controller.changeContent).toHaveBeenCalledWith('编辑后正文');
    expect(controller.cancelEditing).toHaveBeenCalledOnce();
    expect(controller.finishEditing).toHaveBeenCalledOnce();

    controller.isEditingContent = false;
    controller.content = '';
    controller.data.content = '';
    controller.hasUserContent = false;
    controller.pickerDismissed = true;
    rerender(<TextAnnotationNodeView controller={controller} />);
    fireEvent.click(screen.getByText('node.textNode.placeholder'));
    expect(controller.enterEditMode).toHaveBeenCalledOnce();
  });
});
