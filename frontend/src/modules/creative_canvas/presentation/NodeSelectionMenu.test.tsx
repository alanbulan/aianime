// Copyright (c) 2026 AI anime
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NODE_SELECTION_MENU_NODE_TYPES } from '../domain/nodeSelectionMenuModel';
import { NodeSelectionMenu } from './NodeSelectionMenu';

const translations: Record<string, string> = {
  'node.menu.sectionAddNode': '添加节点',
  'node.menu.sectionSkillNode': '技能节点',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

describe('NodeSelectionMenu', () => {
  it('assembles the controller and view for the add-node menu', () => {
    render(
      <NodeSelectionMenu
        position={{ x: 12, y: 16 }}
        nodeDefinitions={[
          {
            type: NODE_SELECTION_MENU_NODE_TYPES.beatContext,
            label: '镜头上下文',
            icon: 'sparkles',
          },
        ]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('镜头上下文')).toBeInTheDocument();
  });
});
