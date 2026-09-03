// Copyright (c) 2026 AI anime
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { CANVAS_NODE_TYPES } from '../domain/canvasConnection';
import type { CanvasNode } from '../domain/canvasNodeData';
import {
  createScene360Overlay,
  type Scene360OverlayGenerateScene360,
  type Scene360OverlayStore,
} from './Scene360Overlay';

vi.mock('@xyflow/react', () => ({
  NodeToolbar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Position: { Bottom: 'bottom' },
}));

describe('Scene360Overlay', () => {
  it('uses the fixed panorama ratio and binds generation to the result node', async () => {
    const sourceNode: CanvasNode = {
      id: 'source-1',
      type: CANVAS_NODE_TYPES.upload,
      position: { x: 0, y: 0 },
      data: { imageUrl: '/static/master.png', aspectRatio: '16:9' },
    };
    const task = {
      task_key: 'scene-360-task',
      task_type: 'stage_asset',
      job_id: 'scene-360-job',
    };
    const addNode = vi.fn().mockReturnValueOnce('pano-1').mockReturnValueOnce('viewer-1');
    const updateNodeData = vi.fn();
    const store: Scene360OverlayStore = {
      addNode,
      addEdge: vi.fn(),
      setSelectedNode: vi.fn(),
      findNodePosition: vi.fn().mockReturnValue({ x: 400, y: 0 }),
      updateNodeData,
    };
    const generateCanvasScene360 = vi.fn<Scene360OverlayGenerateScene360>(
      async (_params, onTaskSubmitted) => {
        onTaskSubmitted(task);
        return { task, url: '/static/pano.png' };
      },
    );
    const Scene360Overlay = createScene360Overlay({
      useStore: (selector) => selector(store),
      useCanvasImageModels: () => ({
        models: [{
          id: 'image-1',
          label: 'Image model',
          apiModel: 'cloud-image-standard',
          routeSelector: 'image-route',
        }],
      }),
      generateCanvasScene360,
    });
    const screen = await render(
      <Scene360Overlay
        projectId="project-1"
        canvasId="canvas-1"
        node={sourceNode}
        imageSource="/static/master.png"
        onClose={vi.fn()}
      />,
    );

    await expect.element(screen.getByText('2:1')).toBeVisible();
    await expect.element(screen.getByText('21:9')).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole('button', { name: 'scene360.aspectRatioLabel' }))
      .not.toBeInTheDocument();
    await screen.getByRole('button').nth(1).click();

    expect(generateCanvasScene360).toHaveBeenCalledWith(
      {
        projectId: 'project-1',
        canvasId: 'canvas-1',
        nodeId: 'pano-1',
        referenceUrl: '/static/master.png',
        model: 'cloud-image-standard',
        modelSelector: 'image-route',
      },
      expect.any(Function),
    );
    expect(addNode).toHaveBeenCalledWith(
      CANVAS_NODE_TYPES.exportImage,
      expect.any(Object),
      expect.objectContaining({ aspectRatio: '2:1', isGenerating: true }),
    );
    expect(updateNodeData).toHaveBeenCalledWith(
      'pano-1',
      expect.objectContaining({ generationTaskKey: task.task_key }),
    );
    expect(updateNodeData).toHaveBeenCalledWith(
      'pano-1',
      expect.objectContaining({
        imageUrl: '/static/pano.png',
        aspectRatio: '2:1',
        isGenerating: false,
      }),
    );
  });
});
