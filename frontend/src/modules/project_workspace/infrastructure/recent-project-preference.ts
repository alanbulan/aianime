import type { RecentProjectPreference } from "@/modules/project_workspace/application/ports";

const STORAGE_KEY = "ai-anime-dashboard-recent-created-project";

export const recentProjectPreference: RecentProjectPreference = {
  read() {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  },
  write(projectName) {
    window.localStorage.setItem(STORAGE_KEY, projectName);
  },
};
