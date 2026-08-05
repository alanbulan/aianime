// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  convertCanvasNodeType,
  type ConversionDefaultDataGateway,
  type ConversionGraphNode,
  type ConversionNodeCatalog,
} from './canvasNodeConversion';

const catalog: ConversionNodeCatalog = {
  getDefinition: () => ({ createDefaultData: () => ({}) }),
};

function uploadNode(): ConversionGraphNode {
  return {
    id: 'upload',
    type: 'uploadNode',
    position: { x: 10, y: 20 },
    measured: { width: 320, height: 350 },
    width: 320,
    height: 350,
    style: { width: 320, height: 350, opacity: 0.5 },
    data: { imageUrl: '/old.png', legacyOnly: true },
  };
}

describe('Canvas node type conversion', () => {
  it('rebuilds data from the target definition and overrides while resetting measurements', () => {
    const source = uploadNode();
    const result = convertCanvasNodeType(
      [source],
      source.id,
      'videoNode',
      catalog,
      {
        videoUrl: '/video.mp4',
        displayName: 'Video',
      },
    );

    expect(result.changed).toBe(true);
    expect(result.nodes[0]).toMatchObject({
      id: source.id,
      type: 'videoNode',
      position: source.position,
      measured: undefined,
      width: undefined,
      height: undefined,
      style: source.style,
      data: {
        videoUrl: '/video.mp4',
        displayName: 'Video',
      },
    });
    expect(result.nodes[0]?.data).not.toHaveProperty('legacyOnly');
  });

  it('returns the original graph for a missing node or identical type', () => {
    const source = uploadNode();
    const nodes = [source];

    expect(
      convertCanvasNodeType(nodes, 'missing', 'videoNode', catalog),
    ).toEqual({ nodes, changed: false });
    expect(
      convertCanvasNodeType(nodes, source.id, 'uploadNode', catalog),
    ).toEqual({ nodes, changed: false });
  });

  it('applies runtime defaults before explicit conversion overrides', () => {
    const source = uploadNode();
    const gateway: ConversionDefaultDataGateway = {
      getOverrides: () => ({ model: 'remembered-model' }),
    };
    const preferred = convertCanvasNodeType(
      [source],
      source.id,
      'videoNode',
      catalog,
      {},
      gateway,
    );
    const explicit = convertCanvasNodeType(
      [source],
      source.id,
      'videoNode',
      catalog,
      { model: 'explicit-model' },
      gateway,
    );

    expect(preferred.nodes[0]?.data).toMatchObject({
      model: 'remembered-model',
    });
    expect(explicit.nodes[0]?.data).toMatchObject({
      model: 'explicit-model',
    });
  });
});
