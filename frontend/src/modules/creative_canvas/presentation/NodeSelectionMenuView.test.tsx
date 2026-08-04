// Copyright (c) 2026 AI anime
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SkillDefinition } from '../domain/skillContract';
import { NODE_SELECTION_MENU_NODE_TYPES } from '../domain/nodeSelectionMenuModel';
import {
  NodeSelectionMenuView,
  type NodeSelectionMenuNodeDefinition,
} from './NodeSelectionMenuView';
import type { NodeSelectionMenuController } from './useNodeSelectionMenuController';

vi.mock('./skillI18n', () => ({
  translateSkillDescription: (skill: SkillDefinition) => `description:${skill.id}`,
  translateSkillName: (skill: SkillDefinition) => `skill:${skill.id}`,
}));

const nodeDefinitions: NodeSelectionMenuNodeDefinition<string>[] = [
  { type: NODE_SELECTION_MENU_NODE_TYPES.video, label: '视频', icon: 'video' },
];

function skill(id: string): SkillDefinition {
  return {
    id,
    provider: 'tool',
    display_name: id,
    description: '',
    inputs: [],
    outputs: [],
  };
}

function createController(): NodeSelectionMenuController<string> {
  return {
    translate: (key: string) => ({
      'node.menu.sectionAddNode': '添加节点',
      'node.menu.sectionSkillNode': '技能节点',
    })[key] ?? key,
    menuRef: createRef<HTMLDivElement>(),
    mainPanelRef: createRef<HTMLDivElement>(),
    skillPanelRef: createRef<HTMLDivElement>(),
    isVisible: true,
    isPositioned: true,
    panelPosition: { x: 24, y: 36 },
    skillPanelSide: 'right',
    referenceGenerateItems: null,
    skillGroups: [],
    activeSkillProvider: null,
    activeSkillGroup: null,
    canSelectSkill: false,
    close: vi.fn(),
    selectNode: vi.fn(),
    selectSkill: vi.fn(),
    showSkillProvider: vi.fn(),
    cancelSkillPanelClose: vi.fn(),
    scheduleSkillPanelClose: vi.fn(),
  } as unknown as NodeSelectionMenuController<string>;
}

describe('NodeSelectionMenuView', () => {
  it('renders reference actions at the projected position', () => {
    const controller = createController();
    controller.referenceGenerateItems = [{
      key: 'pano360',
      label: '360° 全景',
      type: NODE_SELECTION_MENU_NODE_TYPES.pano360Viewer,
      disabled: false,
    }];
    const { container } = render(
      <NodeSelectionMenuView
        controller={controller}
        nodeDefinitions={nodeDefinitions}
      />,
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass('opacity-100');
    expect(root).toHaveStyle({ left: '24px', top: '36px' });
    fireEvent.click(
      screen.getByRole('button', { name: '360° 全景' }),
      { clientX: 44, clientY: 55 },
    );
    expect(controller.selectNode).toHaveBeenCalledWith(
      NODE_SELECTION_MENU_NODE_TYPES.pano360Viewer,
      { x: 44, y: 55 },
    );
  });

  it('renders add-node and skill commands from controller state', () => {
    const controller = createController();
    const item = skill('tool.visible');
    controller.skillGroups = [{ provider: 'tool', items: [item] }];
    controller.activeSkillProvider = 'tool';
    controller.activeSkillGroup = { provider: 'tool', items: [item] };
    controller.canSelectSkill = true;
    controller.skillPanelSide = 'left';
    render(
      <NodeSelectionMenuView
        controller={controller}
        nodeDefinitions={nodeDefinitions}
      />,
    );

    expect(screen.getByText('添加节点')).toBeInTheDocument();
    expect(screen.getByText('技能节点')).toBeInTheDocument();
    expect(screen.getAllByText('工具技能')).toHaveLength(2);
    expect(screen.getByText('description:tool.visible')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '视频' }));
    expect(controller.selectNode).toHaveBeenCalledWith(
      NODE_SELECTION_MENU_NODE_TYPES.video,
      { x: 0, y: 0 },
    );

    fireEvent.mouseEnter(screen.getAllByRole('button')[1]);
    expect(controller.cancelSkillPanelClose).toHaveBeenCalled();
    expect(controller.showSkillProvider).toHaveBeenCalledWith('tool');
    fireEvent.click(screen.getByRole('button', { name: /skill:tool.visible/ }));
    expect(controller.selectSkill).toHaveBeenCalledWith(item);
  });
});
