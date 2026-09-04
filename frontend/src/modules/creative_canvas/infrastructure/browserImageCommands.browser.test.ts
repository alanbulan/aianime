// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { resolveImageSplitLayout } from '../domain/toolImageGeometry';
import { splitImageSource } from './browserImageCommands';

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('failed to load test image'));
    image.src = source;
  });
}

describe('splitImageSource', () => {
  it('exports the same cells as the preview layout and removes separators', async () => {
    const source = document.createElement('canvas');
    source.width = 10;
    source.height = 8;
    const context = source.getContext('2d');
    if (!context) throw new Error('canvas is unavailable');

    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, source.width, source.height);
    const layout = resolveImageSplitLayout(source.width, source.height, 2, 3, 1);
    if (!layout) throw new Error('layout is unavailable');
    const colors = ['#0000ff', '#00ff00', '#ffff00', '#00ffff', '#ff00ff', '#ffffff'];
    layout.cellRects.forEach((rect, index) => {
      context.fillStyle = colors[index];
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
    });

    const outputs = await splitImageSource(source.toDataURL('image/png'), 2, 3, 1);
    const images = await Promise.all(outputs.map(loadImage));

    expect(images.map((image) => [image.naturalWidth, image.naturalHeight])).toEqual(
      layout.cellRects.map((rect) => [rect.width, rect.height]),
    );

    const second = document.createElement('canvas');
    second.width = images[1].naturalWidth;
    second.height = images[1].naturalHeight;
    const secondContext = second.getContext('2d');
    if (!secondContext) throw new Error('canvas is unavailable');
    secondContext.drawImage(images[1], 0, 0);
    expect([...secondContext.getImageData(0, 0, 1, 1).data]).toEqual([
      0,
      255,
      0,
      255,
    ]);
  });
});
