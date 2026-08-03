// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { CANVAS_CONNECTION_NODE_TYPES } from './canvasConnection';
import {
  getDefaultNodeDisplayName,
  isNodeUsingDefaultDisplayName,
  resolveNodeDisplayName,
} from './nodeDisplay';

describe('Canvas node display names', () => {
  it('uses node and export-result defaults', () => {
    expect(resolveNodeDisplayName(CANVAS_CONNECTION_NODE_TYPES.video, {})).toBe('视频');
    expect(getDefaultNodeDisplayName(
      CANVAS_CONNECTION_NODE_TYPES.exportImage,
      { resultKind: 'storyboardFrameEdit' },
    )).toBe('单格结果');
  });

  it('prefers a custom title and the legacy group label', () => {
    expect(resolveNodeDisplayName(
      CANVAS_CONNECTION_NODE_TYPES.imageGen,
      { displayName: '  主视觉  ' },
    )).toBe('主视觉');
    expect(resolveNodeDisplayName(
      CANVAS_CONNECTION_NODE_TYPES.group,
      { label: '  第一幕  ' },
    )).toBe('第一幕');
  });

  it('identifies default and customized display names', () => {
    expect(isNodeUsingDefaultDisplayName(
      CANVAS_CONNECTION_NODE_TYPES.audio,
      {},
    )).toBe(true);
    expect(isNodeUsingDefaultDisplayName(
      CANVAS_CONNECTION_NODE_TYPES.audio,
      { displayName: '音频' },
    )).toBe(true);
    expect(isNodeUsingDefaultDisplayName(
      CANVAS_CONNECTION_NODE_TYPES.audio,
      { displayName: '旁白' },
    )).toBe(false);
  });
});
