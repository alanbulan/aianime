import type { CommercialAnnouncementGateway } from "@/modules/platform_release/application/commercial-announcement-ports";
import { parseCommercialAnnouncementFeed } from "@/modules/platform_release/domain/commercial-announcement";

export const electronCommercialAnnouncementGateway: CommercialAnnouncementGateway = {
  async fetch(limit = 20) {
    const commercial = window.aiAnimeDesktop?.commercial;
    if (!commercial) {
      throw new Error("Commercial Gateway requires the Electron desktop app");
    }
    return parseCommercialAnnouncementFeed(
      await commercial.announcements(limit),
    );
  },
};
