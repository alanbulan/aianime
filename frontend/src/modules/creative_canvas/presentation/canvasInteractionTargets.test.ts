// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  isCanvasPaneTarget,
  isSpacePanKey,
  isTypingTarget,
  PAN_ACTIVATION_KEY_CODE,
} from './canvasInteractionTargets';

describe('Canvas interaction targets', () => {
  it('recognizes the empty React Flow pane but excludes interactive descendants', () => {
    const wrapper = document.createElement('div');
    const pane = document.createElement('div');
    pane.className = 'react-flow__pane';
    const emptyChild = document.createElement('span');
    const node = document.createElement('div');
    node.className = 'react-flow__node';
    const button = document.createElement('button');
    pane.append(emptyChild, node, button);
    wrapper.append(pane);

    expect(isCanvasPaneTarget(pane, wrapper)).toBe(true);
    expect(isCanvasPaneTarget(emptyChild, wrapper)).toBe(true);
    expect(isCanvasPaneTarget(node, wrapper)).toBe(false);
    expect(isCanvasPaneTarget(button, wrapper)).toBe(false);
    expect(isCanvasPaneTarget(document.createElement('div'), wrapper)).toBe(false);
  });

  it('recognizes native and semantic text editing targets', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const textbox = document.createElement('div');
    const textboxChild = document.createElement('span');
    textbox.setAttribute('role', 'textbox');
    textbox.append(textboxChild);
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });

    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(textarea)).toBe(true);
    expect(isTypingTarget(select)).toBe(true);
    expect(isTypingTarget(textboxChild)).toBe(true);
    expect(isTypingTarget(editable)).toBe(true);
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it('accepts current and legacy space key values for canvas panning', () => {
    expect(PAN_ACTIVATION_KEY_CODE).toBe('Space');
    expect(isSpacePanKey({ code: 'Space', key: 'x' })).toBe(true);
    expect(isSpacePanKey({ code: 'Unidentified', key: ' ' })).toBe(true);
    expect(isSpacePanKey({ code: 'Unidentified', key: 'Spacebar' })).toBe(true);
    expect(isSpacePanKey({ code: 'KeyS', key: 's' })).toBe(false);
  });
});
