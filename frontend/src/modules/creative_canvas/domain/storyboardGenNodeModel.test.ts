// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from 'vitest';

import {
  areStoryboardFrameDraftsEqual,
  buildStoryboardFrameDescriptionDrafts,
  buildStoryboardGenerationPrompt,
  formatStoryboardAspectRatio,
  resizeStoryboardGenFrames,
  resolveAutoStoryboardRequestAspectRatio,
  resolveStoryboardGenAspectRatios,
  resolveStoryboardGenControlAspectRatio,
  resolveStoryboardGenLayout,
  resolveStoryboardGenRatioControlMode,
  resolveStoryboardGenerationFrameNotes,
  resolveStoryboardGridCount,
  storyboardRatioValueToAspectRatio,
  type StoryboardGenFrameItem,
  updateStoryboardGenFrameDescription,
} from './storyboardGenNodeModel';

function frame(
  id: string,
  description: string,
  referenceIndex: number | null = null,
): StoryboardGenFrameItem {
  return { id, description, referenceIndex };
}

describe('storyboardGenNodeModel', () => {
  it('resolves cell and overall ratios without losing friendly labels', () => {
    expect(resolveStoryboardGenRatioControlMode('overall', false)).toBe('cell');
    expect(resolveStoryboardGenRatioControlMode('overall', true)).toBe(
      'overall',
    );
    expect(resolveStoryboardGenControlAspectRatio('auto', '4:3')).toBe('4:3');
    expect(resolveStoryboardGenControlAspectRatio('16:9', '4:3')).toBe(
      '16:9',
    );

    const ratios = resolveStoryboardGenAspectRatios(
      'cell',
      16 / 9,
      2,
      3,
    );
    expect(ratios.cellRatioValue).toBeCloseTo(16 / 9);
    expect(ratios.overallRatioValue).toBeCloseTo(8 / 3);
    expect(ratios.cellAspectRatioLabel).toBe('16:9');
    expect(formatStoryboardAspectRatio(1.7)).toBe('1.70:1');
    expect(storyboardRatioValueToAspectRatio(Number.NaN)).toBe('1:1');
  });

  it('projects minimum and resized grid geometry deterministically', () => {
    expect(
      resolveStoryboardGenLayout({
        rows: 2,
        cols: 2,
        frameAspectRatio: '1:1',
        showAdvancedControls: false,
      }),
    ).toEqual({
      baseSize: { width: 470, height: 470 },
      size: { width: 470, height: 470 },
      cellWidth: 170,
      gridWidth: 348,
      paramsRowWidth: 446,
      cellAspectRatioCss: '1 / 1',
    });
    expect(
      resolveStoryboardGenLayout({
        rows: 2,
        cols: 2,
        frameAspectRatio: '1:1',
        showAdvancedControls: false,
        width: 600.4,
        height: 700.4,
      }),
    ).toMatchObject({
      size: { width: 600, height: 700 },
      cellWidth: 284,
      gridWidth: 576,
      paramsRowWidth: 576,
    });
  });

  it('resizes frames and updates reference indexes without mutating inputs', () => {
    const original = [frame('first', '主角')];
    const createId = vi.fn()
      .mockReturnValueOnce('second')
      .mockReturnValueOnce('third');
    const expanded = resizeStoryboardGenFrames(original, 3, createId);
    expect(expanded).toEqual([
      original[0],
      frame('second', ''),
      frame('third', ''),
    ]);
    expect(expanded[0]).toBe(original[0]);
    expect(resizeStoryboardGenFrames(expanded, 1, createId)).toEqual([
      original[0],
    ]);

    const updated = updateStoryboardGenFrameDescription(
      original,
      0,
      '主角参考 @图2',
      3,
    );
    expect(updated).toEqual([frame('first', '主角参考 @图2', 1)]);
    expect(original).toEqual([frame('first', '主角')]);
    expect(
      updateStoryboardGenFrameDescription(updated, 0, '主角参考 @图2', 3),
    ).toBe(updated);
  });

  it('builds draft-aware prompts and sanitized metadata notes', () => {
    const frames = [frame('first', '旧描述'), frame('second', '')];
    const drafts = { first: ' 新描述 @ 图1 ', second: '' };
    expect(buildStoryboardFrameDescriptionDrafts(frames)).toEqual({
      first: '旧描述',
      second: '',
    });
    expect(
      areStoryboardFrameDraftsEqual(
        { first: '旧描述', second: '' },
        buildStoryboardFrameDescriptionDrafts(frames),
      ),
    ).toBe(true);
    expect(
      buildStoryboardGenerationPrompt({
        rows: 1,
        cols: 2,
        frames,
        drafts,
        keepStyleConsistent: true,
        disableTextInImage: true,
        autoInferEmptyFrame: true,
      }),
    ).toBe(
      [
        '生成一张1×2的2宫格多版本候选图，每一格是独立候选画面，图片风格与参考图保持一致，禁止添加描述文本。',
        '候选1：新描述 图1',
        '候选2：依据之前的内容进行推测',
      ].join('\n'),
    );
    expect(
      resolveStoryboardGenerationFrameNotes({
        frames,
        drafts: { first: '主角 @图1', second: '空镜' },
        frameCount: 2,
        ignoreAtTag: true,
      }),
    ).toEqual(['主角', '空镜']);
  });

  it('clamps grid controls and maps detected auto ratios to model options', () => {
    expect(resolveStoryboardGridCount(1, -1)).toBe(1);
    expect(resolveStoryboardGridCount(9, 1)).toBe(9);
    expect(resolveStoryboardGridCount(4, 2)).toBe(6);
    expect(
      resolveAutoStoryboardRequestAspectRatio({
        mode: 'cell',
        detectedControlRatio: 16 / 9,
        rows: 2,
        cols: 3,
        supportedAspectRatios: ['1:1', '16:9', '21:9'],
      }),
    ).toBe('21:9');
  });
});
