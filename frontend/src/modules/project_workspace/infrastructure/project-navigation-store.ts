// Copyright (c) 2026 AI anime
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { quotaSafeStateStorage } from "@/shared/localStorageQuota";

import {
  isRememberedSection,
  type ProjectSection,
  type WorkspaceSection,
} from "@/modules/project_workspace/domain/project-navigation";

/**
 * 记住每个项目的导航位置：
 * - lastSectionByProject：项目内最后停留的区块（AI anime 画布 freezone 或AI anime 工作台各子页），
 *   进入项目时恢复到这里，而不是固定落到AI anime 画布。
 * - lastWorkspaceSectionByProject：最后停留的 AI anime 工作台子页（素材导入/资产库/分镜制作/AI anime 助手/风格管理），
 *   顶部切到「AI anime 工作台」时恢复到这里，而不是固定落到素材导入。
 */

interface ProjectNavState {
  lastSectionByProject: Record<string, ProjectSection>;
  lastWorkspaceSectionByProject: Record<string, WorkspaceSection>;
  rememberSection: (project: string, section: ProjectSection) => void;
  reset: () => void;
}

export const useProjectNavigationStore = create<ProjectNavState>()(
  persist(
    (set) => ({
      lastSectionByProject: {},
      lastWorkspaceSectionByProject: {},
      rememberSection: (project, section) =>
        set((state) => {
          if (!project || !isRememberedSection(section)) return state;
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
