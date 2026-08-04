// Copyright (c) 2026 AI anime
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NODE_SELECTION_MENU_NODE_TYPES } from '../domain/nodeSelectionMenuModel';
import { CanvasAddNodePanel } from './CanvasAddNodePanel';

const translations: Record<string, string> = {
  'node.menu.sectionAddNode': '添加节点',
  'node.menu.sectionSkillNode': '技能节点',
  'node.menu.beatContext': '镜头上下文',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

describe('CanvasAddNodePanel', () => {
  it('shows standalone shot context in the quick add panel', async () => {
    const user = userEvent.setup();
    const onSelectNode = vi.fn();
    const onClose = vi.fn();

    render(
      <CanvasAddNodePanel
        nodeDefinitions={[
          {
            type: NODE_SELECTION_MENU_NODE_TYPES.beatContext,
            label: 'node.menu.beatContext',
            icon: 'sparkles',
          },
        ]}
        skillItems={[]}
        onSelectNode={onSelectNode}
        onSelectSkill={vi.fn()}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole('button', { name: /镜头上下文/ }));

    expect(onSelectNode).toHaveBeenCalledWith(
      NODE_SELECTION_MENU_NODE_TYPES.beatContext,
    );
    expect(onClose).toHaveBeenCalled();
  });
});
