// Copyright (c) 2026 AI anime
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  CanvasConnectionPreviewOverlay,
  CanvasTransientOverlays,
} from './CanvasTransientOverlays';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const hiddenOverlays = {
  isCanvasEmpty: false,
  marqueeSelectionRect: null,
  nodePlacementPreview: null,
  isCanvasDropActive: false,
} as const;

describe('CanvasTransientOverlays', () => {
  it('renders no overlay content when every transient state is inactive', () => {
    const { container } = render(
      <CanvasTransientOverlays {...hiddenOverlays} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the empty-canvas hint from presentation translations', () => {
    render(
      <CanvasTransientOverlays
        {...hiddenOverlays}
        isCanvasEmpty
      />,
    );

    expect(screen.getByText('Tab').parentElement).toHaveTextContent(
      'canvas.emptyHintBeforeTabTabcanvas.emptyHintAfterTab',
    );
  });

  it('projects marquee, placement, drop and connection preview models', () => {
    render(
      <>
        <CanvasTransientOverlays
          {...hiddenOverlays}
          marqueeSelectionRect={{ left: 10, top: 20, width: 30, height: 40 }}
          nodePlacementPreview={{
            left: 50,
            top: 60,
            width: 320,
            height: 200,
            label: 'Video node',
          }}
          isCanvasDropActive
        />
        <CanvasConnectionPreviewOverlay
          preview={{
            left: 0,
            top: 0,
            width: 640,
            height: 480,
            d: 'M 0 0 L 20 30',
            stroke: 'rgb(1 2 3)',
            strokeWidth: 1,
            strokeLinecap: 'round',
          }}
        />
      </>,
    );

    expect(screen.getByTestId('canvas-marquee-selection')).toHaveStyle({
      left: '10px',
      top: '20px',
      width: '30px',
      height: '40px',
    });
    expect(screen.getByTestId('canvas-node-placement-preview')).toHaveStyle({
      left: '50px',
      top: '60px',
      width: '320px',
      height: '200px',
    });
    expect(screen.getByText('Video node')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-drop-overlay')).toBeInTheDocument();
    const connectionPreview = screen.getByTestId('canvas-connection-preview');
    expect(connectionPreview).toHaveAttribute('width', '640');
    expect(connectionPreview.querySelector('path')).toHaveAttribute(
      'd',
      'M 0 0 L 20 30',
    );
  });
});
