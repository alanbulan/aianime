// Copyright (c) 2026 AI anime
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NodeResizeHandle } from './NodeResizeHandle';

const resizeControlProps = vi.fn();

vi.mock('@xyflow/react', () => ({
  NodeResizeControl: (props: Record<string, unknown>) => {
    resizeControlProps(props);
    return <div data-testid="resize-control">{props.children as React.ReactNode}</div>;
  },
}));

describe('NodeResizeHandle', () => {
  it('forwards keepAspectRatio to aspect-locked nodes', () => {
    render(<NodeResizeHandle keepAspectRatio />);
    expect(resizeControlProps).toHaveBeenCalledWith(
      expect.objectContaining({ keepAspectRatio: true }),
    );
  });

  it('leaves keepAspectRatio undefined by default', () => {
    resizeControlProps.mockClear();
    render(<NodeResizeHandle />);
    expect(resizeControlProps).toHaveBeenCalledWith(
      expect.objectContaining({ keepAspectRatio: undefined }),
    );
  });
});
