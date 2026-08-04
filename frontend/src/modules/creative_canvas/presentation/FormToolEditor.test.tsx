// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CanvasToolPlugin } from '../domain/canvasTool';
import { NODE_TOOL_TYPES } from '../domain/canvasNodeTool';
import { FormToolEditor } from './FormToolEditor';

const plugin: CanvasToolPlugin = {
  type: NODE_TOOL_TYPES.crop,
  labelKey: 'tool.crop',
  icon: 'crop',
  editor: 'form',
  supportsNode: () => true,
  createInitialOptions: () => ({}),
  fields: [],
  execute: async () => ({}),
};

describe('FormToolEditor', () => {
  it('renders the supplied schema and emits an immutable option update', () => {
    const onOptionsChange = vi.fn();
    render(
      <FormToolEditor
        plugin={plugin}
        fields={[
          {
            key: 'prompt',
            label: '提示词',
            type: 'text',
            placeholder: '输入提示词',
          },
          {
            key: 'mode',
            label: '模式',
            type: 'select',
            options: [
              { label: '快速', value: 'fast' },
              { label: '精细', value: 'quality' },
            ],
          },
        ]}
        options={{ prompt: '原始内容', mode: 'fast' }}
        onOptionsChange={onOptionsChange}
      />,
    );

    expect(screen.getByText('提示词')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '快速' })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('输入提示词'), {
      target: { value: '新内容' },
    });
    expect(onOptionsChange).toHaveBeenCalledWith({
      prompt: '新内容',
      mode: 'fast',
    });
  });
});
