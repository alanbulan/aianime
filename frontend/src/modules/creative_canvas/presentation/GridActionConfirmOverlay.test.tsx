// Copyright (c) 2026 AI anime
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CANVAS_NODE_TYPES } from '../domain/canvasConnection';
import type { CanvasNode } from '../domain/canvasNodeData';
import {
  createGridActionConfirmOverlay,
  type GridActionConfirmOverlayGenerateGridAction,
  type GridActionConfirmOverlayStore,
} from './GridActionConfirmOverlay';

vi.mock('@xyflow/react', () => ({
  NodeToolbar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Position: { Bottom: 'bottom' },
}));

vi.mock('./ProviderModelPicker', () => ({
  ProviderModelPicker: ({
    onChange,
  }: {
    onChange: (modelId: string) => void;
  }) => (
    <button type="button" onClick={() => onChange('image-2')}>
      select-second-model
    </button>
  ),
}));

describe('GridActionConfirmOverlay', () => {
  it('submits the full template prompt and persists the explicit model selection', async () => {
    const sourceNode: CanvasNode = {
      id: 'source-1',
      type: CANVAS_NODE_TYPES.upload,
      position: { x: 0, y: 0 },
      data: {
        imageUrl: '/static/source.png',
        aspectRatio: '4:3',
        mainline_context: [{ project_id: 'project-1' }],
        slot_target: { kind: 'beat_render', beat: 2 },
      },
    };
    const task = {
      task_key: 'freezone_template_edit:grid-job',
      task_type: 'freezone_template_edit',
      job_id: 'grid-job',
    };
    const addNode = vi.fn().mockReturnValue('grid-result');
    const updateNodeData = vi.fn();
    const store: GridActionConfirmOverlayStore = {
      addNode,
      addEdge: vi.fn(),
      setSelectedNode: vi.fn(),
      findNodePosition: vi.fn().mockReturnValue({ x: 420, y: 0 }),
      updateNodeData,
    };
    const generateCanvasGridAction = vi.fn<GridActionConfirmOverlayGenerateGridAction>(
      async (_params, onTaskSubmitted) => {
        onTaskSubmitted(task);
        return { task, url: '/static/grid-result.png' };
      },
    );
    const GridActionConfirmOverlay = createGridActionConfirmOverlay({
      useStore: (selector) => selector(store),
      useCanvasImageModels: () => ({
        models: [
          {
            id: 'image-1',
            label: 'Image one',
            apiModel: 'cloud-image-one',
          },
          {
            id: 'image-2',
            label: 'Image two',
            apiModel: 'cloud-image-two',
            routeSelector: 'edit-route-two',
          },
        ],
      }),
      generateCanvasGridAction,
    });

    render(
      <GridActionConfirmOverlay
        projectId="project-1"
        node={sourceNode}
        imageSource="/static/source.png"
        request={{
          nodeId: sourceNode.id,
          key: 'multiCameraGrid',
          label: '多机位九宫格',
          prompt: 'Create nine coherent camera views of the same subject.',
          cost: 14,
        }}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'select-second-model' }));
    fireEvent.click(screen.getByRole('button', {
      name: 'nodeToolbar.gridMenu.confirmBar.submit',
    }));

    expect(generateCanvasGridAction).toHaveBeenCalledWith(
      {
        projectId: 'project-1',
        sourceUrl: '/static/source.png',
        actionKey: 'multiCameraGrid',
        prompt: 'Create nine coherent camera views of the same subject.',
        model: 'cloud-image-two',
        modelSelector: 'edit-route-two',
      },
      expect.any(Function),
    );
    expect(addNode).toHaveBeenCalledWith(
      CANVAS_NODE_TYPES.exportImage,
      { x: 420, y: 0 },
      expect.objectContaining({
        aspectRatio: '4:3',
        generationDurationMs: 60000,
        isGenerating: true,
        mainline_context: sourceNode.data.mainline_context,
        slot_target: sourceNode.data.slot_target,
        user_spawned: true,
        gridActionRequest: expect.objectContaining({
          actionKey: 'multiCameraGrid',
          catalogModelId: 'image-2',
          model: 'cloud-image-two',
          modelSelector: 'edit-route-two',
          prompt: 'Create nine coherent camera views of the same subject.',
          sourceUrl: '/static/source.png',
        }),
      }),
    );
    await waitFor(() => {
      expect(updateNodeData).toHaveBeenCalledWith(
        'grid-result',
        expect.objectContaining({
          imageUrl: '/static/grid-result.png',
          isGenerating: false,
          previewImageUrl: '/static/grid-result.png',
        }),
      );
    });
  });
});
