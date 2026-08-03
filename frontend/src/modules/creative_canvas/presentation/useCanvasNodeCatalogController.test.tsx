// Copyright (c) 2026 AI anime
import type { TFunction } from 'i18next';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SkillDefinition } from '@/modules/creative_canvas/domain/skillContract';

import { useCanvasNodeCatalogController } from './useCanvasNodeCatalogController';

type TestNodeType = 'upload' | 'skill';
interface TestNodeData {
  label?: string;
}

describe('useCanvasNodeCatalogController', () => {
  it('loads skills and delegates ordinary node labels through the injected port', async () => {
    const skill = {
      id: 'freezone.test_skill',
      display_name: 'Fallback skill name',
      description: '',
    } as SkillDefinition;
    const loadSkillRegistry = vi.fn().mockResolvedValue([skill]);
    const resolveNodeTypeLabel = vi.fn(() => '上传图片');
    const translate = vi.fn((key: string) =>
      key.endsWith('.name') ? '测试技能' : key,
    ) as unknown as TFunction;

    const { result } = renderHook(() =>
      useCanvasNodeCatalogController<TestNodeType, TestNodeData>({
        translate,
        loadSkillRegistry,
        resolveNodeTypeLabel,
      }),
    );

    await waitFor(() => expect(result.current.skills).toEqual([skill]));
    expect(result.current.skillById.get(skill.id)).toBe(skill);
    expect(result.current.resolvePlacementLabel({ type: 'upload' })).toBe(
      '上传图片',
    );
    expect(result.current.resolvePlacementLabel({
      type: 'skill',
      skill,
    })).toBe('测试技能');
    expect(resolveNodeTypeLabel).toHaveBeenCalledWith('upload');
    expect(loadSkillRegistry).toHaveBeenCalledOnce();
  });
});
