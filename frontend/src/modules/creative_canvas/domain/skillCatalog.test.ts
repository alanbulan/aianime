// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import type { SkillDefinition } from '@/modules/creative_canvas/domain/skillContract';

import { normalizeCanvasSkillCatalog } from './skillCatalog';

function skill(
  id: string,
  inputs: SkillDefinition['inputs'],
): SkillDefinition {
  return {
    id,
    provider: 'freezone_mainline',
    display_name: id,
    description: '',
    inputs,
    outputs: [],
  };
}

describe('Canvas skill catalog', () => {
  it('requires every scene source for the 360 skill only', () => {
    const scene360 = skill('freezone_scene_360', [
      {
        role: 'scene',
        label: 'Scene',
        accepts: {},
        required: false,
        cardinality: 'single',
      },
      {
        role: 'scene_master',
        label: 'Master',
        accepts: {},
        required: false,
        cardinality: 'single',
      },
      {
        role: 'source_image',
        label: 'Optional source',
        accepts: {},
        required: false,
        cardinality: 'single',
      },
    ]);
    const untouched = skill('freezone.other', []);

    const normalized = normalizeCanvasSkillCatalog([scene360, untouched]);

    expect(normalized[0].inputs.map(({ role, required }) => ({ role, required }))).toEqual([
      { role: 'scene', required: true },
      { role: 'scene_master', required: true },
      { role: 'source_image', required: false },
    ]);
    expect(normalized[1]).toBe(untouched);
  });
});
