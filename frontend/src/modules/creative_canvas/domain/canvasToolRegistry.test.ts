// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from 'vitest';

import { CANVAS_CONNECTION_NODE_TYPES } from './canvasConnection';
import { NODE_TOOL_TYPES } from './canvasNodeTool';
import { builtInToolPlugins, cropToolPlugin } from './canvasToolCatalog';
import { getNodeToolPlugins, getToolPlugin } from './canvasToolRegistry';

describe('canvasToolRegistry', () => {
  it('exposes each built-in tool through its canonical type', () => {
    expect(getToolPlugin(NODE_TOOL_TYPES.crop)).toBe(cropToolPlugin);
    expect(getToolPlugin('unknown' as typeof NODE_TOOL_TYPES.crop)).toBeNull();
  });

  it('only returns tools for supported nodes with an image source', () => {
    const supported = getNodeToolPlugins({
      type: CANVAS_CONNECTION_NODE_TYPES.imageGen,
      data: { referenceImageUrl: 'reference-url' },
    });

    expect(supported).toEqual(builtInToolPlugins);
    expect(getNodeToolPlugins({
      type: CANVAS_CONNECTION_NODE_TYPES.upload,
      data: {},
    })).toEqual([]);
    expect(getNodeToolPlugins({
      type: CANVAS_CONNECTION_NODE_TYPES.video,
      data: { imageUrl: 'poster-url' },
    })).toEqual([]);
  });

  it('delegates plugin execution through the supplied tool context', async () => {
    const processTool = vi.fn().mockResolvedValue({ outputImageUrl: 'result-url' });

    await expect(cropToolPlugin.execute(
      'source-url',
      { aspectRatio: '16:9' },
      { processTool },
    )).resolves.toEqual({ outputImageUrl: 'result-url' });
    expect(processTool).toHaveBeenCalledWith(
      NODE_TOOL_TYPES.crop,
      'source-url',
      { aspectRatio: '16:9' },
    );
  });
});
