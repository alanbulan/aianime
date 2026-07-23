import type { ProjectLinkClipboard } from "@/modules/project_workspace/application/ports";

export const browserProjectLinkClipboard: ProjectLinkClipboard = {
  async copy(project) {
    const path = `/projects/${encodeURIComponent(project.id)}/ingest`;
    const value =
      typeof window === "undefined" ? path : `${window.location.origin}${path}`;
    await navigator.clipboard.writeText(value);
  },
};
