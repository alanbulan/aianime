// Copyright (c) 2026 AI anime
import type { TFunction } from 'i18next';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SkillDefinition } from '@/features/freezone/context/skillRoles';

import { CANVAS_NODE_TYPES } from '../domain/canvasNodes';
import { useCanvasNodeCatalogController } from './useCanvasNodeCatalogController';

const skillApiMocks = vi.hoisted(() => ({
  getSkillRegistry: vi.fn(),
}));

vi.mock('@/api/skills', () => skillApiMocks);

describe('useCanvasNodeCatalogController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the skill catalog and resolves node and skill placement labels', async () => {
    const skill = {
      id: 'freezone.test_skill',
      display_name: 'Fallback skill name',
      description: '',
    } as SkillDefinition;
    skillApiMocks.getSkillRegistry.mockResolvedValue([skill]);
    const translate = vi.fn((key: string) => {
      if (key === 'node.menu.uploadImage') return '上传图片';
      if (key.endsWith('.name')) return '测试技能';
      return key;
    }) as unknown as TFunction;

    const { result } = renderHook(() =>
      useCanvasNodeCatalogController({ translate }),
    );

    await waitFor(() => expect(result.current.skills).toEqual([skill]));
    expect(result.current.skillById.get(skill.id)).toBe(skill);
    expect(result.current.resolvePlacementLabel({
      type: CANVAS_NODE_TYPES.upload,
    })).toBe('上传图片');
    expect(result.current.resolvePlacementLabel({
      type: CANVAS_NODE_TYPES.skill,
      skill,
    })).toBe('测试技能');
    expect(skillApiMocks.getSkillRegistry).toHaveBeenCalledOnce();
  });
});
