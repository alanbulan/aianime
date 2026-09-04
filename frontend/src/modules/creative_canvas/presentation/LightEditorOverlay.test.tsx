// Copyright (c) 2026 AI anime
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CANVAS_NODE_TYPES } from '../domain/canvasConnection';
import type { CanvasNode } from '../domain/canvasNodeData';
import {
  createLightEditorOverlay,
  type LightEditorOverlayGenerateRelight,
  type LightEditorOverlayStore,
} from './LightEditorOverlay';

vi.mock('@xyflow/react', () => ({
  NodeToolbar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Position: { Bottom: 'bottom' },
}));

vi.mock('./ZoomScaledToolbar', () => ({
  ZoomScaledToolbar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('./LightEditorPanel', () => ({
  LightEditorPanel: ({ onSubmit }: { onSubmit: (payload: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSubmit({
          prompt: 'preserve subject; relight from left',
          displayName: '打光 · 左侧',
          brightness: 72,
          color: '#ffeecc',
          colorTemperatureKelvin: 4200,
          mainLight: {
            vector: { x: -0.7, y: 0 },
            depth: 'front',
            nearestPreset: 'left',
            label: '左侧',
          },
          rimLight: true,
          smartMode: {
            enabled: true,
            prompt: 'keep facial detail',
            preset: 'goldenHour',
            presetLabel: '黄金时刻',
            presetPrompt: 'golden hour',
          },
          catalogModelId: 'image-2',
          apiModel: 'cloud-image-two',
          modelSelector: 'edit-route-two',
          imageSize: '2K',
        })
      }
    >
      submit-relight
    </button>
  ),
}));

describe('LightEditorOverlay', () => {
  it('persists the full request and submits with original aspect ratio', async () => {
    const sourceNode: CanvasNode = {
      id: 'source-1',
      type: CANVAS_NODE_TYPES.upload,
      position: { x: 0, y: 0 },
      data: { imageUrl: '/static/source.png', aspectRatio: '3:4' },
    };
    const task = {
      task_key: 'freezone_relight:job',
      task_type: 'freezone_relight',
      job_id: 'job',
    };
    const addNode = vi.fn().mockReturnValue('relight-result');
    const updateNodeData = vi.fn();
    const store: LightEditorOverlayStore = {
      addNode,
      addEdge: vi.fn(),
      setSelectedNode: vi.fn(),
      findNodePosition: vi.fn().mockReturnValue({ x: 420, y: 0 }),
      updateNodeData,
    };
    const generateCanvasRelight = vi.fn<LightEditorOverlayGenerateRelight>(
      async (_params, onTaskSubmitted) => {
        onTaskSubmitted(task);
        return { task, url: '/static/relit.png' };
      },
    );
    const LightEditorOverlay = createLightEditorOverlay({
      useStore: (selector) => selector(store),
      generateCanvasRelight,
    });

    render(
      <LightEditorOverlay
        projectId="project-1"
        node={sourceNode}
        imageSource="/static/source.png"
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'submit-relight' }));

    expect(generateCanvasRelight).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        sourceUrl: '/static/source.png',
        aspectRatio: 'original',
        brightness: 72,
        colorTemperatureKelvin: 4200,
        model: 'cloud-image-two',
        modelSelector: 'edit-route-two',
      }),
      expect.any(Function),
    );
    expect(addNode).toHaveBeenCalledWith(
      CANVAS_NODE_TYPES.exportImage,
      { x: 420, y: 0 },
      expect.objectContaining({
        aspectRatio: '3:4',
        lightEditorRequest: expect.objectContaining({
          requestAspectRatio: 'original',
          prompt: 'preserve subject; relight from left',
          colorTemperatureKelvin: 4200,
          catalogModelId: 'image-2',
          model: 'cloud-image-two',
          modelSelector: 'edit-route-two',
          imageSize: '2K',
        }),
      }),
    );
    await waitFor(() =>
      expect(updateNodeData).toHaveBeenCalledWith(
        'relight-result',
        expect.objectContaining({
          imageUrl: '/static/relit.png',
          previewImageUrl: '/static/relit.png',
          isGenerating: false,
        }),
      ),
    );
  });
});
