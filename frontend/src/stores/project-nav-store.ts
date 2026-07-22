// Copyright (c) 2026 AI anime
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { quotaSafeStateStorage } from "@/lib/localStorageQuota";

import type { ProjectSection } from "@/components/layout/project-navigation-routes";

/**
 * 记住每个项目的导航位置：
 * - lastSectionByProject：项目内最后停留的区块（AI anime 画布 freezone 或AI anime 工作台各子页），
 *   进入项目时恢复到这里，而不是固定落到AI anime 画布。
 * - lastWorkspaceSectionByProject：最后停留的 AI anime 工作台子页（素材导入/资产库/分镜制作/AI anime 助手/风格管理），
 *   顶部切到「AI anime 工作台」时恢复到这里，而不是固定落到素材导入。
 */

/** 可被记忆的区块：AI anime 画布 + AI anime 工作台五个子页（tasks 等其它路由不参与记忆）。 */
const REMEMBERED_SECTIONS = new Set<ProjectSection>([
  "freezone",
  "ingest",
  "characters",
  "episodes",
  "assistant",
  "styles",
]);

export type WorkspaceSection = Exclude<
  ProjectSection,
  "freezone" | "tasks"
>;

export function isRememberedSection(
  section: ProjectSection | null,
): section is ProjectSection {
  return section !== null && REMEMBERED_SECTIONS.has(section);
}

interface ProjectNavState {
  lastSectionByProject: Record<string, ProjectSection>;
  lastWorkspaceSectionByProject: Record<string, WorkspaceSection>;
  rememberSection: (project: string, section: ProjectSection) => void;
  reset: () => void;
}

export const useProjectNavStore = create<ProjectNavState>()(
  persist(
    (set) => ({
      lastSectionByProject: {},
      lastWorkspaceSectionByProject: {},
      rememberSection: (project, section) =>
        set((state) => {
          if (!project || !REMEMBERED_SECTIONS.has(section)) return state;
          const next: Partial<ProjectNavState> = {
            lastSectionByProject: {
              ...state.lastSectionByProject,
              [project]: section,
            },
          };
          if (section !== "freezone") {
            next.lastWorkspaceSectionByProject = {
              ...state.lastWorkspaceSectionByProject,
              [project]: section as WorkspaceSection,
            };
          }
          return next as ProjectNavState;
        }),
      reset: () =>
        set({ lastSectionByProject: {}, lastWorkspaceSectionByProject: {} }),
    }),
    {
      name: "ai-anime-project-nav",
      version: 2,
      storage: createJSONStorage(() => quotaSafeStateStorage),
    },
  ),
);
