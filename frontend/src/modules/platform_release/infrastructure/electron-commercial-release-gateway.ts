import type { CommercialReleaseGateway } from "@/modules/platform_release/application/commercial-release-ports";
import { parseCommercialReleaseStatus } from "@/modules/platform_release/domain/commercial-release";

export const electronCommercialReleaseGateway: CommercialReleaseGateway = {
  async check() {
    const commercial = window.aiAnimeDesktop?.commercial;
    if (!commercial) {
      throw new Error("Commercial Gateway requires the Electron desktop app");
    }
    return parseCommercialReleaseStatus(await commercial.checkRelease());
  },
  async downloadUpdate(artifactId) {
    const commercial = window.aiAnimeDesktop?.commercial;
    if (!commercial?.downloadUpdate) {
      throw new Error("Update download requires the Electron desktop app");
    }
    return commercial.downloadUpdate(artifactId);
  },
  async installUpdate() {
    const commercial = window.aiAnimeDesktop?.commercial;
    if (!commercial?.installUpdate) {
      throw new Error("Update install requires the Electron desktop app");
    }
    await commercial.installUpdate();
  },
};
