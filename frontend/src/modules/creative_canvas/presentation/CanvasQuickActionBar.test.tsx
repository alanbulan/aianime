// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CanvasQuickActionBar } from './CanvasQuickActionBar';

const translations: Record<string, string> = {
  'canvas.quickbar.addNode': '添加节点',
  'canvas.quickbar.history': '历史素材',
  'canvas.quickbar.shortcuts': '快捷键',
  'canvas.quickbar.help': '帮助',
  'canvas.quickbar.viewManual': '查看手册',
  'canvas.quickbar.helpMenu.tutorial': '使用教程',
  'common.close': '关闭',
  'node.menu.sectionAddNode': '添加节点',
  'node.menu.sectionSkillNode': '技能节点',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

describe('CanvasQuickActionBar', () => {
  it('opens the injected history adapter and closes it through its command port', async () => {
    const user = userEvent.setup();
    const HistoryAssetsModal = vi.fn((props: { onClose: () => void }) => (
      <button type="button" onClick={props.onClose}>关闭历史</button>
    ));

    render(
      <CanvasQuickActionBar
        projectId="project-1"
        canvasId="canvas-1"
        nodeDefinitions={[]}
        skillItems={[]}
        onAddNode={vi.fn()}
        onAddSkill={vi.fn()}
        onUseAsset={vi.fn()}
        onDeleteNode={vi.fn()}
        HistoryAssetsModal={HistoryAssetsModal}
      />,
    );

    await user.click(screen.getByRole('button', { name: '历史素材' }));

    expect(HistoryAssetsModal).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        canvasId: 'canvas-1',
      }),
      undefined,
    );
    await user.click(screen.getByRole('button', { name: '关闭历史' }));
    expect(screen.queryByRole('button', { name: '关闭历史' })).toBeNull();
  });

  it('keeps add hover behavior and renders shortcuts/help from the same surface', async () => {
    const user = userEvent.setup();
    render(
      <CanvasQuickActionBar
        projectId="project-1"
        canvasId="canvas-1"
        nodeDefinitions={[]}
        skillItems={[]}
        onAddNode={vi.fn()}
        onAddSkill={vi.fn()}
        onUseAsset={vi.fn()}
        onDeleteNode={vi.fn()}
        HistoryAssetsModal={() => null}
      />,
    );

    fireEvent.mouseEnter(screen.getByRole('button', { name: '添加节点' }));
    expect(screen.getByText('添加节点')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '快捷键' }));
    expect(screen.getByText('canvas.shortcuts.groups.create')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '帮助' }));
    expect(screen.getByRole('link', { name: '使用教程' })).toHaveAttribute(
      'target',
      '_blank',
    );
  });
});
