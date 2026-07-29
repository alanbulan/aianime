// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  buildImageEditGenerationPrompt,
  buildImageEditResultNodeTitle,
  collectImageEditInputSlotTarget,
  collectImageEditInputSourceMeta,
  mergeImageEditCandidateSourceMeta,
  mergeImageEditReferenceUrls,
  planImageEditAssetReferences,
  projectImageEditGenerationModeChoices,
  projectImageEditPromptSegments,
  resolveImageEditGenerationMode,
  resolveImageEditNodeSize,
} from './imageEditNodeModel';

describe('imageEditNodeModel', () => {
  it('projects node size, generation mode, and prompt references', () => {
    expect(resolveImageEditNodeSize(410.6, undefined)).toEqual({
      width: 520,
      height: 520,
    });
    expect(resolveImageEditGenerationMode(undefined, 2)).toBe('all_reference');
    expect(resolveImageEditGenerationMode('image_to_image', 0)).toBe(
      'image_to_image',
    );
    expect(projectImageEditGenerationModeChoices(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'text_to_image', disabled: true }),
        expect.objectContaining({ key: 'image_reference', disabled: false }),
        expect.objectContaining({ key: 'image_to_video', disabled: true }),
      ]),
    );
    expect(projectImageEditPromptSegments('主体 @图1 尾部', 1)).toEqual([
      { kind: 'text', text: '主体 ', start: 0 },
      { kind: 'reference', text: '@图1', start: 3 },
      { kind: 'text', text: ' 尾部', start: 6 },
    ]);
  });

  it('builds the live upstream prompt, title, and deduplicated references', () => {
    expect(
      buildImageEditGenerationPrompt(' 让 @图1 更清晰 ', '上游脚本文本'),
    ).toBe('上游脚本文本\n\n让 图1 更清晰');
    expect(buildImageEditResultNodeTitle(' 结果标题 ', '默认结果')).toBe(
      '结果标题',
    );
    expect(buildImageEditResultNodeTitle(' ', '默认结果')).toBe('默认结果');
    expect(
      mergeImageEditReferenceUrls(
        ['/a.png', '/b.png'],
        ['/b.png', '/c.mp4'],
      ),
    ).toEqual(['/a.png', '/b.png', '/c.mp4']);
  });

  it('resolves direct upstream source metadata and canonical slot targets', () => {
    const nodes = [
      {
        id: 'source-a',
        data: {
          __freezone_source: {
            kind: 'identity',
            label: '角色甲',
            slot_target: { kind: 'identity', characterId: 'char-a' },
          },
        },
      },
      {
        id: 'source-b',
        data: { slot_target: { kind: 'frame', beatId: 'beat-a' } },
      },
    ];
    const edges = [
      { source: 'source-a', target: 'edit' },
      { source: 'source-b', target: 'edit' },
    ];
    expect(collectImageEditInputSourceMeta('edit', nodes, edges)).toMatchObject(
      { kind: 'identity', label: '角色甲' },
    );
    expect(collectImageEditInputSlotTarget('edit', nodes, edges)).toMatchObject(
      { kind: 'identity', characterId: 'char-a' },
    );
  });

  it('projects candidate provenance without mutating the origin', () => {
    const origin = {
      kind: 'identity',
      label: '角色甲',
      meta: { character_id: 'char-a' },
    };
    const candidate = mergeImageEditCandidateSourceMeta(
      origin,
      { id: 'repair', outputKind: 'identity_portrait' },
      { target_kind: 'portrait' },
      undefined,
    );
    expect(candidate).toEqual({
      kind: 'identity_portrait',
      role: 'candidate',
      label: '角色甲',
      meta: {
        character_id: 'char-a',
        target_kind: 'portrait',
        capability_id: 'repair',
        output_kind: 'identity_portrait',
        origin,
      },
    });
    expect(origin).toEqual({
      kind: 'identity',
      label: '角色甲',
      meta: { character_id: 'char-a' },
    });
  });

  it('plans only image assets in a centered upstream stack', () => {
    const plans = planImageEditAssetReferences({
      selections: [
        { media: 'image', url: '/a.png', name: 'A' },
        { media: 'video', url: '/skip.mp4', name: 'skip' },
        { media: 'image', url: '/b.png', name: 'B' },
      ],
      nodePosition: { x: 1000, y: 200 },
      nodeHeight: 600,
    });
    expect(plans).toEqual([
      {
        selection: { media: 'image', url: '/a.png', name: 'A' },
        position: { x: 640, y: 248 },
      },
      {
        selection: { media: 'image', url: '/b.png', name: 'B' },
        position: { x: 640, y: 512 },
      },
    ]);
  });
});
