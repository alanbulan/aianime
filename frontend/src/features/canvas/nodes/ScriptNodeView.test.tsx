// Copyright (c) 2026 AI anime
import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ScriptNodeController } from '@/features/canvas/hooks/useScriptNodeController';

import { ScriptNodeView } from './ScriptNodeView';

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
  NodeGenerationOverlay: () => <div>generation-overlay</div>,
  RegenerateButton: ({
    label,
    onClick,
  }: {
    label: string;
    onClick(): void;
  }) => (
    <button type="button" onClick={onClick}>
      regenerate:{label}
    </button>
  ),
  EditableTableCell: ({
    value,
    onCommit,
  }: {
    value: string;
    onCommit(value: string): void;
  }) => (
    <button type="button" onClick={() => onCommit('编辑后')}>
      edit:{value}
    </button>
  ),
  NodeResizeHandle: ({
    minWidth,
    minHeight,
  }: {
    minWidth: number;
    minHeight: number;
  }) => <div>resize:{minWidth}:{minHeight}</div>,
  OperationPanelShell: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
  PanelExpandButton: ({ onToggle }: { onToggle(): void }) => (
    <button type="button" onClick={onToggle}>expand-panel</button>
  ),
  NodeGenerationHistory: ({
    onRestore,
    records,
  }: {
    onRestore(record: unknown): void;
    records: unknown[];
  }) => (
    <button type="button" onClick={() => onRestore(records[0])}>
      restore-history
    </button>
  ),
}));

vi.mock('@/components/credits/credit-visual', () => ({
  CreditCostPill: ({ display }: { display?: string }) => (
    <div>credit:{display}</div>
  ),
}));

function createController(): ScriptNodeController {
  return {
    data: {
      label: '分镜脚本',
      displayName: '分镜脚本',
    },
    selected: true,
    title: '分镜脚本',
    rows: [],
    hasResult: false,
    size: { width: 480, height: 320 },
    headerSubtitle: '',
    references: [],
    hasUpstream: false,
    prompt: '',
    historyRecords: [],
    historyLoading: false,
    isGenerating: false,
    isTranslating: false,
    isFullscreen: false,
    panelExpanded: false,
    referencePreview: null,
    actions: [
      { key: 'fromScript', label: '剧本生成分镜脚本' },
      { key: 'fromVideoRef', label: '视频参考生成分镜脚本' },
      { key: 'fromCharacter', label: '角色生成分镜脚本' },
    ],
    showOperationsPanel: false,
    submitDisabled: false,
    scriptCostDisplay: '3 credits',
    select: vi.fn(),
    rename: vi.fn(),
    changePrompt: vi.fn(),
    commitCell: vi.fn(),
    pickAction: vi.fn(),
    submit: vi.fn(async () => undefined),
    translate: vi.fn(async () => undefined),
    restoreHistory: vi.fn(),
    refreshHistory: vi.fn(async () => undefined),
    isHistoryRecordActive: vi.fn(() => false),
    openFullscreen: vi.fn(),
    closeFullscreen: vi.fn(),
    collapsePanel: vi.fn(),
    togglePanel: vi.fn(),
    showReferencePreview: vi.fn(),
    hideReferencePreview: vi.fn(),
  } as unknown as ScriptNodeController;
}

describe('ScriptNodeView', () => {
  it('renders empty actions and forwards node, title, and action commands', () => {
    const controller = createController();
    const { container } = render(<ScriptNodeView controller={controller} />);

    expect(screen.getByText('handle:target')).toBeInTheDocument();
    expect(screen.getByText('handle:source')).toBeInTheDocument();
    expect(screen.getByText('resize:360:240')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'title:分镜脚本' }));
    fireEvent.click(
      screen.getByRole('button', { name: '剧本生成分镜脚本' }),
    );
    fireEvent.click(container.firstElementChild as HTMLElement);

    expect(controller.rename).toHaveBeenCalledWith('新标题');
    expect(controller.pickAction).toHaveBeenCalledWith('fromScript');
    expect(controller.select).toHaveBeenCalled();
  });

  it('renders editable results, retry feedback, and fullscreen commands', () => {
    const controller = createController();
    controller.data.generationError = '重新生成失败';
    controller.hasResult = true;
    controller.headerSubtitle = '第一集';
    controller.rows = [{ shot_no: 1, dialogue: '对白' }];
    controller.isFullscreen = true;
    render(<ScriptNodeView controller={controller} />);

    expect(screen.getAllByText('第一集').length).toBeGreaterThan(0);
    expect(screen.getByText('重新生成失败')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'edit:1' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '全屏' }));
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    fireEvent.click(screen.getByRole('button', { name: 'regenerate:重试' }));

    expect(controller.commitCell).toHaveBeenCalledWith(
      0,
      'shot_no',
      '编辑后',
    );
    expect(controller.openFullscreen).toHaveBeenCalledOnce();
    expect(controller.closeFullscreen).toHaveBeenCalledOnce();
    expect(controller.submit).toHaveBeenCalledOnce();
  });

  it('renders operations, references, history, and preview while forwarding commands', () => {
    const controller = createController();
    const videoReference = {
      nodeId: 'video-a',
      kind: 'video' as const,
      videoUrl: '/video.mp4',
      displayName: '参考视频',
    };
    controller.showOperationsPanel = true;
    controller.prompt = '剧情提示';
    controller.references = [videoReference];
    controller.hasUpstream = true;
    controller.historyRecords = [
      { id: 'history-a', status: 'completed', result: { rows: [] } } as never,
    ];
    controller.referencePreview = {
      reference: videoReference,
      index: 0,
      left: 100,
      top: 200,
      width: 240,
    };
    render(<ScriptNodeView controller={controller} />);

    expect(screen.getByText('credit:3 credits')).toBeInTheDocument();
    expect(document.body.querySelector('video[src="/video.mp4"]')).not.toBeNull();
    fireEvent.change(screen.getByDisplayValue('剧情提示'), {
      target: { value: '新提示' },
    });
    fireEvent.click(screen.getByRole('button', { name: '翻译（中英文互译）' }));
    fireEvent.click(screen.getByRole('button', { name: '生成' }));
    fireEvent.click(screen.getByRole('button', { name: 'expand-panel' }));
    fireEvent.click(screen.getByRole('button', { name: 'restore-history' }));
    fireEvent.mouseEnter(screen.getByTitle('参考视频'));
    fireEvent.mouseLeave(screen.getByTitle('参考视频'));

    expect(controller.changePrompt).toHaveBeenCalledWith('新提示');
    expect(controller.translate).toHaveBeenCalledOnce();
    expect(controller.submit).toHaveBeenCalledOnce();
    expect(controller.togglePanel).toHaveBeenCalledOnce();
    expect(controller.restoreHistory).toHaveBeenCalledOnce();
    expect(controller.showReferencePreview).toHaveBeenCalledWith(
      videoReference,
      expect.objectContaining({
        left: expect.any(Number),
        top: expect.any(Number),
        width: expect.any(Number),
      }),
    );
    expect(controller.hideReferencePreview).toHaveBeenCalledOnce();
  });
});
