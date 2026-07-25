// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { NODE_TOOL_TYPES, type CanvasNode } from './canvasNodes';
import {
  resolveActiveToolDialog,
  resolveSelectedNodeId,
} from './canvasSelection';

const nodes = [{ id: 'existing' } as CanvasNode];

describe('Canvas selection', () => {
  it('keeps only a selected node that still exists', () => {
    expect(resolveSelectedNodeId('existing', nodes)).toBe('existing');
    expect(resolveSelectedNodeId('missing', nodes)).toBeNull();
    expect(resolveSelectedNodeId(null, nodes)).toBeNull();
  });

  it('keeps only a tool dialog whose target still exists', () => {
    const dialog = {
      nodeId: 'existing',
      toolType: NODE_TOOL_TYPES.crop,
    };

    expect(resolveActiveToolDialog(dialog, nodes)).toBe(dialog);
    expect(
      resolveActiveToolDialog({ ...dialog, nodeId: 'missing' }, nodes),
    ).toBeNull();
    expect(resolveActiveToolDialog(null, nodes)).toBeNull();
  });
});
