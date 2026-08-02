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
};
