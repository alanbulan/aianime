// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LightEditorPanel } from './LightEditorPanel';

vi.mock('../generationCatalogComposition', () => ({
  useCanvasImageModels: () => ({
    models: [
      { id: 'image-1', label: 'Image one', apiModel: 'cloud-image-one' },
      {
        id: 'image-2',
        label: 'Image two',
        apiModel: 'cloud-image-two',
        routeSelector: 'edit-route-two',
      },
    ],
  }),
}));

vi.mock('./ProviderModelPicker', () => ({
  ProviderModelPicker: ({
    selectedModelId,
    onChange,
  }: {
    selectedModelId: string;
    onChange: (modelId: string) => void;
  }) => (
    <button type="button" onClick={() => onChange('image-2')}>
      model:{selectedModelId}
    </button>
  ),
}));

describe('LightEditorPanel', () => {
  it('shows an explicit model picker, preserves the preview and submits that model', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <LightEditorPanel
        projectId="project-1"
        imageSource="/static/source.png"
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(container.querySelector('img')).toHaveClass('object-contain');
    fireEvent.click(screen.getByRole('button', { name: 'model:image-1' }));
    fireEvent.click(
      screen.getByRole('button', { name: /lightEditor\.submit|生成|提交/ }),
    );

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogModelId: 'image-2',
        apiModel: 'cloud-image-two',
        modelSelector: 'edit-route-two',
        imageSize: '2K',
      }),
    );
  });
});
