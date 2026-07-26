// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useState } from 'react';

import type { SkillDefinition } from '@/features/freezone/public';

export type LoadCanvasSkillRegistry = () => Promise<SkillDefinition[]>;

export interface CanvasSkillRegistryResult {
  skills: SkillDefinition[];
  skillById: ReadonlyMap<string, SkillDefinition>;
  isLoading: boolean;
  loadError: string | null;
}

export function useCanvasSkillRegistry(
  loadSkillRegistry: LoadCanvasSkillRegistry,
): CanvasSkillRegistryResult {
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    loadSkillRegistry()
      .then((items) => {
        if (!cancelled) {
          setSkills(items);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
        console.warn('[SkillNode] failed to load skill registry for canvas connections', error);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
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
    isLoading,
    loadError,
  };
}
