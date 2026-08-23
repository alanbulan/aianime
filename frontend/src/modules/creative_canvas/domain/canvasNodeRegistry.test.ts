// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { CANVAS_NODE_TYPES } from './canvasConnection';
import {
  getMenuNodeDefinitions,
  getNodeDefinition,
} from './canvasNodeRegistry';

describe('StyleNode registry definition', () => {
  it('keeps the projection out of user creation menus', () => {
    expect(
      getMenuNodeDefinitions().map((definition) => definition.type),
    ).not.toContain(CANVAS_NODE_TYPES.style);
  });

  it('creates projection data without freezing a derived display name', () => {
    const definition = getNodeDefinition(CANVAS_NODE_TYPES.style);
    expect(definition.capabilities).toEqual({
      toolbar: false,
      promptInput: false,
    });
    expect(definition.createDefaultData()).toEqual({
      styleTemplateId: null,
    });
  });
});
