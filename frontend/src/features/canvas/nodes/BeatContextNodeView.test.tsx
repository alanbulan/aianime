// Copyright (c) 2026 AI anime
import { createRef, type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { BeatContextNodeController } from '@/features/canvas/hooks/useBeatContextNodeController';
import { BeatContextNodeView } from './BeatContextNodeView';

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div>handle:{id}</div>,
  Position: { Right: 'right' },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const value = String(options?.defaultValue ?? key);
      return value.replace('{{message}}', String(options?.message ?? ''));
    },
  }),
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

vi.mock('@/features/freezone/public', () => ({
  NodeContextBadges: () => <div>context-badges</div>,
  extractMainlineContextsFromNode: () => [],
  parseBeatContextVisualMarkers: () => ({ identities: [], props: [] }),
}));

vi.mock('@/components/ui', () => ({
  UiSelect: ({
    children,
    menuClassName: _menuClassName,
    ...props
  }: {
    children: ReactNode;
    menuClassName?: string;
  } & React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props}>{children}</select>
  ),
}));

function createController(): BeatContextNodeController {
  return {
    data: {
      content: '初始画面',
      errorMessage: '',
      snapshot: {},
    },
    selected: true,
    size: { width: 420, height: 560 },
    title: 'EP1 / Beat 2',
    contexts: [],
    episode: 1,
    beat: 2,
    isStandaloneContext: false,
    snapshot: {
      selectedBackgroundExists: true,
      currentSketchExists: false,
      currentFrameExists: true,
    },
    workbenchTarget: { scope: 'beat', episode: 1, beat: 2 },
    syncStatus: 'fresh',
    isSyncing: false,
    openingWorkbench: false,
    editVersion: 0,
    visualDraft: '初始画面',
    identityDraft: ['Alice'],
    propDraft: ['Sword'],
    identityColorDraft: { Alice: '#FF00FF' },
    propColorDraft: { Sword: '#B71C1C' },
    sceneDraft: 'scene-a',
    timeDraft: 'day',
    identityOptions: ['__NO_CHARACTER__', 'Alice'],
    propOptions: ['__NO_PROP__', 'Sword'],
    sceneOptions: ['scene-a', 'scene-b'],
    timeOptions: ['day', 'night'],
    mentionContext: null,
    mentionActiveIndex: 0,
    filteredMentionCandidates: [],
    activeIdentityPaletteId: null,
    activePropPaletteId: null,
    visualTextareaRef: createRef<HTMLTextAreaElement>(),
    select: vi.fn(),
    rename: vi.fn(),
    changeVisualDraft: vi.fn(),
    updateMentionContext: vi.fn(),
    activateMention: vi.fn(),
    insertMention: vi.fn(),
    handleVisualKeyDown: vi.fn(),
    blurVisualDraft: vi.fn(),
    changeScene: vi.fn(),
    changeTime: vi.fn(),
    toggleIdentity: vi.fn(),
    toggleProp: vi.fn(),
    toggleIdentityPalette: vi.fn(),
    togglePropPalette: vi.fn(),
    updateIdentityColor: vi.fn(),
    updatePropColor: vi.fn(),
    openWorkbench: vi.fn(),
    syncToMainline: vi.fn(),
  } as unknown as BeatContextNodeController;
}

describe('BeatContextNodeView', () => {
  it('renders the mainline editor and forwards node, field, and sync commands', () => {
    const controller = createController();
    render(<BeatContextNodeView controller={controller} />);

    fireEvent.click(screen.getByRole('button', { name: 'title:EP1 / Beat 2' }));
    fireEvent.click(screen.getByRole('button', { name: '打开工作台' }));
    const textarea = screen.getByDisplayValue('初始画面');
    fireEvent.change(textarea, { target: { value: '新画面' } });
    fireEvent.select(textarea);
    fireEvent.click(textarea);
    fireEvent.keyDown(textarea, { key: 'Escape' });
    fireEvent.blur(textarea);
    fireEvent.change(screen.getByRole('combobox', { name: '场景' }), {
      target: { value: 'scene-b' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: '时间' }), {
      target: { value: 'night' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sword' }));
    fireEvent.click(screen.getByRole('button', { name: '同步到主线' }));

    expect(controller.rename).toHaveBeenCalledWith('新标题');
    expect(controller.openWorkbench).toHaveBeenCalled();
    expect(controller.changeVisualDraft).toHaveBeenCalled();
    expect(controller.updateMentionContext).toHaveBeenCalledTimes(2);
    expect(controller.handleVisualKeyDown).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'Escape' }),
    );
    expect(controller.blurVisualDraft).toHaveBeenCalled();
    expect(controller.changeScene).toHaveBeenCalledWith('scene-b');
    expect(controller.changeTime).toHaveBeenCalledWith('night');
    expect(controller.toggleIdentity).toHaveBeenCalledWith('Alice');
    expect(controller.toggleProp).toHaveBeenCalledWith('Sword');
    expect(controller.syncToMainline).toHaveBeenCalled();
    expect(screen.getByText('resize:360:360:760:900')).toBeInTheDocument();
  });

  it('renders standalone mentions and forwards palette interaction', () => {
    const controller = createController();
    controller.isStandaloneContext = true;
    controller.title = '自定义镜头上下文';
    controller.mentionContext = { start: 0, end: 1, query: '' };
    controller.filteredMentionCandidates = [
      {
        kind: 'identity',
        id: 'identity-template',
        label: '人物',
        token: '{{}}',
      },
    ];
    controller.activeIdentityPaletteId = 'Alice';
    render(<BeatContextNodeView controller={controller} />);

    const mention = screen.getByRole('button', { name: /人物.*\{\{\}\}/ });
    fireEvent.mouseEnter(mention);
    fireEvent.click(mention);
    fireEvent.click(screen.getByLabelText('身份颜色 Alice'));
    fireEvent.click(screen.getByRole('button', { name: '人物颜色 #FF00FF' }));

    expect(controller.activateMention).toHaveBeenCalledWith(0);
    expect(controller.insertMention).toHaveBeenCalledWith(
      controller.filteredMentionCandidates[0],
    );
    expect(controller.toggleIdentityPalette).toHaveBeenCalledWith('Alice');
    expect(controller.updateIdentityColor).toHaveBeenCalledWith(
      'Alice',
      '#FF00FF',
    );
    expect(
      screen.queryByRole('button', { name: '同步到主线' }),
    ).not.toBeInTheDocument();
  });

  it('keeps stale tokens and sync errors visible without owning state', () => {
    const controller = createController();
    controller.identityDraft = ['Alice', 'Removed'];
    controller.syncStatus = 'error';
    controller.data = { ...controller.data, errorMessage: '网络错误' };
    render(<BeatContextNodeView controller={controller} />);

    expect(screen.getByRole('button', { name: /Removed.*已移除/ })).toBeInTheDocument();
    expect(screen.getByText('同步失败：网络错误')).toBeInTheDocument();
    expect(screen.getByText('背景 已选')).toBeInTheDocument();
    expect(screen.getByText('草图 缺失')).toBeInTheDocument();
    expect(screen.getByText('分镜 已有')).toBeInTheDocument();
  });
});
