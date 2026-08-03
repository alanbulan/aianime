// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasZoomControl } from './CanvasZoomControl';

const zoomMocks = vi.hoisted(() => ({
  zoomTo: vi.fn(),
  getZoom: vi.fn(() => 1),
  fitView: vi.fn(),
  edgeState: {
    hidden: false,
    toggle: vi.fn(),
  },
}));

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    zoomTo: zoomMocks.zoomTo,
    getZoom: zoomMocks.getZoom,
    fitView: zoomMocks.fitView,
  }),
  useViewport: () => ({ zoom: 1 }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('./edgeVisibilityStore', () => ({
  useEdgeVisibilityStore: (
    selector: (state: typeof zoomMocks.edgeState) => unknown,
  ) => selector(zoomMocks.edgeState),
}));

describe('CanvasZoomControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    zoomMocks.edgeState.hidden = false;
    zoomMocks.getZoom.mockReturnValue(1);
  });

  it('routes edge visibility, organization, and menu commands', async () => {
    const onOrganize = vi.fn();
    const user = userEvent.setup();
    render(
      <CanvasZoomControl
        onOrganize={onOrganize}
        isImmersiveViewerActive={() => false}
        styles={{ container: 'control-shell' }}
      />,
    );

    await user.click(screen.getByRole('button', {
      name: 'canvas.toolbar.hideEdges',
    }));
    await user.click(screen.getByRole('button', {
      name: 'canvas.toolbar.organize',
    }));
    await user.click(screen.getByRole('button', {
      name: 'canvas.zoom.menuLabel',
    }));

    expect(zoomMocks.edgeState.toggle).toHaveBeenCalledOnce();
    expect(onOrganize).toHaveBeenCalledOnce();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', {
      name: /canvas\.zoom\.zoomIn/,
    })).toBeInTheDocument();
  });

  it('handles zoom shortcuts and ignores them in immersive mode', () => {
    let immersive = false;
    render(
      <CanvasZoomControl
        onOrganize={vi.fn()}
        isImmersiveViewerActive={() => immersive}
        styles={{ container: 'control-shell' }}
      />,
    );

    fireEvent.keyDown(window, { key: '=', ctrlKey: true });
    expect(zoomMocks.zoomTo).toHaveBeenCalledWith(1.2, { duration: 120 });

    immersive = true;
    fireEvent.keyDown(window, { key: '-', ctrlKey: true });
    expect(zoomMocks.zoomTo).toHaveBeenCalledOnce();
  });
});
