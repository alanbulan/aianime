// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasNodeImage } from './CanvasNodeImage';

const publish = vi.hoisted(() => vi.fn());

vi.mock('../canvasEventComposition', () => ({
  canvasEventBus: { publish },
}));

beforeEach(() => {
  publish.mockClear();
});

describe('CanvasNodeImage', () => {
  it('publishes a normalized image viewer command on double click', () => {
    render(
      <CanvasNodeImage
        alt="preview"
        src="/display.png"
        viewerSourceUrl=" /original.png "
        viewerImageList={['/other.png', '/original.png', '/other.png', null]}
      />,
    );

    fireEvent.doubleClick(screen.getByAltText('preview'));

    expect(publish).toHaveBeenCalledWith('image-viewer/open', {
      imageUrl: '/original.png',
      imageList: ['/other.png', '/original.png'],
    });
  });

  it('respects prevented and disabled viewer interactions', () => {
    const preventViewer = vi.fn((event: React.MouseEvent<HTMLImageElement>) => {
      event.preventDefault();
    });
    const { rerender } = render(
      <CanvasNodeImage
        alt="preview"
        src="/display.png"
        onDoubleClick={preventViewer}
      />,
    );

    fireEvent.doubleClick(screen.getByAltText('preview'));
    expect(preventViewer).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();

    rerender(
      <CanvasNodeImage alt="preview" src="/display.png" disableViewer />,
    );
    fireEvent.doubleClick(screen.getByAltText('preview'));
    expect(publish).not.toHaveBeenCalled();
  });
});
