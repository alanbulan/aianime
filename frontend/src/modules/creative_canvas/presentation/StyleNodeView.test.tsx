// Copyright (c) 2026 AI anime
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';

import type { CanvasStyleTemplate } from '../application/generationCatalog';
import type { CanvasNode, StyleNodeData } from '../domain/canvasNodeData';
import { CANVAS_NODE_TYPES } from '../domain/canvasConnection';
import { StyleNodeView } from './StyleNodeView';
import {
  createUseStyleNodeController,
  type StyleNodeStore,
} from './useStyleNodeController';

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>(
    '@xyflow/react',
  );
  return {
    ...actual,
    Handle: ({ id, type }: { id?: string; type?: string }) => (
      <div data-testid={`handle-${type ?? 'unknown'}-${id ?? 'default'}`} />
    ),
  };
});

vi.mock('./NodeHeader', () => ({
  NODE_HEADER_FLOATING_POSITION_CLASS: '',
  NodeHeader: ({ titleText }: { titleText: string }) => <div>{titleText}</div>,
}));

vi.mock('./StylePickerPopover', () => ({
  describeStyleSelection: (
    selectedId: string | null,
    templates: CanvasStyleTemplate[],
  ) => templates.find((item) => item.id === selectedId) ?? null,
  StylePickerPopover: ({
    onSelect,
  }: {
    onSelect: (id: string | null) => void;
  }) => (
    <button type="button" onClick={() => onSelect('cyberpunk')}>
      使用赛博朋克
    </button>
  ),
}));

const templates: CanvasStyleTemplate[] = [
  {
    id: 'golden_age',
    label: '黄金时代',
    category: '年代',
    coverUrl: '/styles/golden-age.webp',
    stylePrompt: 'golden age',
  },
  {
    id: 'cyberpunk',
    label: '赛博朋克',
    category: '科幻',
    coverUrl: '/styles/cyberpunk.webp',
    stylePrompt: 'cyberpunk',
  },
];

const setSelectedNode = vi.fn();
const updateNodeData = vi.fn();
const retry = vi.fn();
const useStyleStore = create<StyleNodeStore>(() => ({
  nodes: [],
  edges: [],
  setSelectedNode,
  updateNodeData,
}));
const useStyleNodeController = createUseStyleNodeController({
  useStore: useStyleStore,
  useCanvasStyleTemplates: () => ({
    templates,
    isLoading: false,
    error: null,
    retry,
  }),
});

function canvasNode(
  id: string,
  type: CanvasNode['type'],
  data: Record<string, unknown>,
): CanvasNode {
  return { id, type, position: { x: 0, y: 0 }, data } as CanvasNode;
}

function Harness() {
  const controller = useStyleNodeController({
    id: 'style',
    data: { styleTemplateId: 'golden_age' } as StyleNodeData,
    selected: true,
    projectId: 'project-a',
  });
  return <StyleNodeView controller={controller} />;
}

describe('StyleNodeView', () => {
  beforeEach(() => {
    setSelectedNode.mockReset();
    updateNodeData.mockReset();
    retry.mockReset();
    useStyleStore.setState({
      nodes: [
        canvasNode('style', CANVAS_NODE_TYPES.style, {
          styleTemplateId: 'golden_age',
        }),
        canvasNode('image', CANVAS_NODE_TYPES.imageGen, {
          styleTemplateId: 'golden_age',
          prompt: '',
        }),
      ],
      edges: [{ id: 'style-image', source: 'style', target: 'image' }],
    });
  });

  it('renders the selected style cover and derived title', () => {
    render(<Harness />);

    expect(screen.getByAltText('黄金时代')).toHaveAttribute(
      'src',
      '/styles/golden-age.webp',
    );
    expect(screen.getByText('风格 · 年代 · 黄金时代')).toBeInTheDocument();
    expect(screen.getByTestId('handle-source-source')).toBeInTheDocument();
  });

  it('writes a picked style to the downstream image node', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '更换风格' }));
    await user.click(screen.getByRole('button', { name: '使用赛博朋克' }));

    expect(retry).toHaveBeenCalledOnce();
    expect(updateNodeData).toHaveBeenCalledWith('image', {
      styleTemplateId: 'cyberpunk',
    });
    expect(updateNodeData).not.toHaveBeenCalledWith(
      'style',
      expect.anything(),
    );
  });

  it('stays inert when no image node consumes it', async () => {
    const user = userEvent.setup();
    useStyleStore.setState({ edges: [] });
    render(<Harness />);

    expect(screen.getByText('未连接图片节点')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '更换风格' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '风格 黄金时代' }));
    expect(retry).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: '使用赛博朋克' }),
    ).not.toBeInTheDocument();
  });
});
