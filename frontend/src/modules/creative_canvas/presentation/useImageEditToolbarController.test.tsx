// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createUseImageEditToolbarController,
  type ImageEditToolbarControllerDependencies,
} from './useImageEditToolbarController';

const mocks = vi.hoisted(() => ({
  matte: vi.fn(),
  t: vi.fn((key: string) => `translated:${key}`),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mocks.t,
    i18n: { language: 'zh-CN' },
  }),
}));

const dependencies: ImageEditToolbarControllerDependencies = {
  useImageMatteController: vi.fn(() => ({ matte: mocks.matte })),
  openCropTool: vi.fn(),
};
const useImageEditToolbarController =
  createUseImageEditToolbarController(dependencies);

function options() {
  return {
    projectId: 'project-a',
    nodeId: 'image-a',
    nodeData: {},
    imageSource: '/source.png',
    isPresetLocked: false,
    onOpenRedraw: vi.fn(),
    onOpenErase: vi.fn(),
    onOpenUpscale: vi.fn(),
    onOpenOutpaint: vi.fn(),
  };
}

describe('createUseImageEditToolbarController', () => {
  beforeEach(() => {
    mocks.matte.mockReset();
    mocks.t
      .mockReset()
      .mockImplementation((key: string) => `translated:${key}`);
    vi.mocked(dependencies.useImageMatteController)
      .mockReset()
      .mockReturnValue({ matte: mocks.matte });
    vi.mocked(dependencies.openCropTool).mockReset();
  });

  it('projects labels and routes every edit action through its injected owner', () => {
    const input = options();
    const { result } = renderHook(() =>
      useImageEditToolbarController(input),
    );

    expect(result.current.activeAction).toEqual({
      key: 'matting',
      label: 'translated:nodeToolbar.matting',
    });
    expect(dependencies.useImageMatteController).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-a',
        nodeId: 'image-a',
        imageSource: '/source.png',
      }),
    );

    for (const action of result.current.actions) {
      act(() => result.current.selectAction(action.key));
    }

    expect(input.onOpenRedraw).toHaveBeenCalledWith('image-a');
    expect(input.onOpenErase).toHaveBeenCalledWith('image-a');
    expect(mocks.matte).toHaveBeenCalledOnce();
    expect(dependencies.openCropTool).toHaveBeenCalledWith('image-a');
    expect(input.onOpenUpscale).toHaveBeenCalledWith('image-a');
    expect(input.onOpenOutpaint).toHaveBeenCalledWith('image-a');
    expect(result.current.activeAction.key).toBe('outpaint');
  });

  it('removes HD and falls back to matting when a selected node becomes locked', () => {
    const input = options();
    const { result, rerender } = renderHook(
      ({ locked }) =>
        useImageEditToolbarController({
          ...input,
          isPresetLocked: locked,
        }),
      { initialProps: { locked: false } },
    );

    act(() => result.current.selectAction('hd'));
    expect(result.current.activeAction.key).toBe('hd');

    rerender({ locked: true });

    expect(result.current.actions.map((action) => action.key)).not.toContain(
      'hd',
    );
    expect(result.current.activeAction.key).toBe('matting');
  });
});
