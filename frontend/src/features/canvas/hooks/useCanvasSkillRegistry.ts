// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useState } from 'react';

import type { SkillDefinition } from '@/features/freezone/context/skillRoles';

export type LoadCanvasSkillRegistry = () => Promise<SkillDefinition[]>;

export interface CanvasSkillRegistryResult {
  skills: SkillDefinition[];
  skillById: ReadonlyMap<string, SkillDefinition>;
}

export function useCanvasSkillRegistry(
  loadSkillRegistry: LoadCanvasSkillRegistry,
): CanvasSkillRegistryResult {
  const [skills, setSkills] = useState<SkillDefinition[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadSkillRegistry()
      .then((items) => {
        if (!cancelled) {
          setSkills(items);
        }
      })
      .catch((error) => {
        console.warn('[SkillNode] failed to load skill registry for canvas connections', error);
      });
    return () => {
      cancelled = true;
    };
  }, [loadSkillRegistry]);

  const skillById = useMemo(
    () => new Map(skills.map((skill) => [skill.id, skill] as const)),
    [skills],
  );

  return {
    skills,
    skillById,
  };
}
