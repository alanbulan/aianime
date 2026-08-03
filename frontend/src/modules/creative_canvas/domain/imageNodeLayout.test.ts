// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  type CanvasImageLayoutNode,
  maybeApplyImageAutoResize,
  resolveAutoImageNodeDimensions,
  resolveGeneratedImageNodeDimensions,
  withManualSizeLock,
} from './imageNodeLayout';

interface TestImageLayoutNode extends CanvasImageLayoutNode {
  readonly id: string;
  readonly position: { x: number; y: number };
}

function imageNode(
  overrides: Partial<TestImageLayoutNode> = {},
): TestImageLayoutNode {
  return {
    id: 'image',
    type: 'exportImageNode',
    position: { x: 0, y: 0 },
    width: 400,
    height: 400,
    style: { width: 400, height: 400 },
    data: { imageUrl: '/image.png', aspectRatio: '2:1' },
    ...overrides,
  };
}

describe('Canvas image node layout', () => {
  it('snaps a manual resize to the media aspect ratio', () => {
    const resized = withManualSizeLock(imageNode());

    expect(resized.width).toBe(400);
    expect(resized.height).toBe(200);
    expect(resized.style).toMatchObject({ width: 400, height: 200 });
    expect(
      (resized.data as { isSizeManuallyAdjusted?: boolean }).isSizeManuallyAdjusted,
    ).toBe(true);
  });

  it('preserves an already locked and correctly sized node by reference', () => {
    const node = imageNode({
      width: 600,
      height: 300,
      style: { width: 600, height: 300 },
      data: {
        imageUrl: '/image.png',
        aspectRatio: '2:1',
        isSizeManuallyAdjusted: true,
      },
    });

    expect(withManualSizeLock(node)).toBe(node);
  });

  it('uses the patched media ratio unless manual sizing is locked', () => {
    const node = imageNode({
      width: 300,
      height: 300,
      style: { width: 300, height: 300 },
      data: { imageUrl: null, aspectRatio: '1:1' },
    });
    const resized = maybeApplyImageAutoResize(node, {
      imageUrl: '/wide.png',
      aspectRatio: '2:1',
    });

    expect(resized).not.toBe(node);
    expect(resized).toMatchObject({ width: 600, height: 300 });
    expect(
      maybeApplyImageAutoResize(resized, { isSizeManuallyAdjusted: true }),
    ).toBe(resized);
  });

  it('uses real video pixels instead of the generation preset', () => {
    const node = imageNode({
      type: 'videoNode',
      data: { videoUrl: '/vertical.mp4', aspectRatio: '16:9' },
    });
    const resized = maybeApplyImageAutoResize(node, {
      widthPx: 1080,
      heightPx: 1920,
    });

    expect(resized).toMatchObject({ width: 480, height: 853 });
  });

  it('keeps automatic and generated dimensions aligned with their constraints', () => {
    expect(resolveAutoImageNodeDimensions('2:1')).toEqual({
      width: 600,
      height: 300,
    });
    expect(resolveGeneratedImageNodeDimensions('2:1')).toEqual({
      width: 600,
      height: 300,
    });
  });
});
