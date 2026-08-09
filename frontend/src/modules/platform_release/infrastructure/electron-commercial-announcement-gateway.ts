import type { CommercialAnnouncementGateway } from "@/modules/platform_release/application/commercial-announcement-ports";
import { parseCommercialAnnouncementFeed } from "@/modules/platform_release/domain/commercial-announcement";
import {
  invokeCommercial,
  requireCommercialBridge,
} from "@/shared/commercial-bridge";

export const electronCommercialAnnouncementGateway: CommercialAnnouncementGateway = {
  async fetch(limit = 20) {
    return parseCommercialAnnouncementFeed(
      await invokeCommercial(() =>
        requireCommercialBridge().announcements(limit),
      ),
    );
  },
};
