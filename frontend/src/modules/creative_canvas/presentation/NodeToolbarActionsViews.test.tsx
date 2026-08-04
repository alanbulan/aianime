// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AudioNodeToolbarActionsView } from './AudioNodeToolbarActionsView';
import { NodeMainlineToolbarActionsView } from './NodeMainlineToolbarActionsView';
import { NodeManagementToolbarActionsView } from './NodeManagementToolbarActionsView';
import { NodeOutputToolbarActionsView } from './NodeOutputToolbarActionsView';

const translate = ((key: string) => key) as never;

describe('node toolbar action views', () => {
  it('projects mainline state and forwards workbench commands', () => {
    const openWorkbench = vi.fn();
    const ensureBeatContextNode = vi.fn();

    render(
      <NodeMainlineToolbarActionsView
        controller={{
          isPresetLocked: true,
          canOpenWorkbench: true,
          canEnsureBeatContext: true,
          openingWorkbench: false,
          openWorkbench,
          ensureBeatContextNode,
        }}
      />,
    );

    expect(screen.getByText('主线投影 · 锁定')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /打开工作台/ }));
    fireEvent.click(screen.getByRole('button', { name: /镜头上下文/ }));
    expect(openWorkbench).toHaveBeenCalledOnce();
    expect(ensureBeatContextNode).toHaveBeenCalledOnce();
  });

  it('forwards output copy and download commands', () => {
    const copyStoryboardText = vi.fn(async () => undefined);
    const copyGenerationError = vi.fn(async () => undefined);
    const downloadImage = vi.fn(async () => undefined);

    render(
      <NodeOutputToolbarActionsView
        controller={{
          t: translate,
          canCopyStoryboardText: true,
          canCopyGenerationError: true,
          canDownloadImage: true,
          isCopyTextSuccess: false,
          isCopyErrorSuccess: false,
          copyStoryboardText,
          copyGenerationError,
          downloadImage,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'nodeToolbar.copyText' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'nodeToolbar.copyErrorReport' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'nodeToolbar.download' }));
    expect(copyStoryboardText).toHaveBeenCalledOnce();
    expect(copyGenerationError).toHaveBeenCalledOnce();
    expect(downloadImage).toHaveBeenCalledOnce();
  });

  it('forwards projection management commands', () => {
    const syncProjection = vi.fn();
    const remove = vi.fn();
    const commit = vi.fn();

    render(
      <NodeManagementToolbarActionsView
        controller={{
          t: translate,
          projectionKey: 'projection-1',
          projectionIsStale: true,
          removalTarget: 'projection',
          canCommit: true,
          syncProjection,
          remove,
          commit,
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'freezone.projections.syncStale' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'freezone.projections.remove' }),
    );
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(syncProjection).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledOnce();
  });

  it('renders the audio download trigger from the injected state', () => {
    render(
      <AudioNodeToolbarActionsView
        controller={{
          t: translate,
          hasAudio: true,
          convertingFormat: null,
          isConverting: false,
          formatOptions: [
            { format: 'mp3', available: true },
            { format: 'm4a', available: false },
          ],
          download: vi.fn(async () => undefined),
        }}
      />,
    );

    expect(
      screen.getByRole('button', { name: /nodeToolbar.download/ }),
    ).toBeEnabled();
  });
});
