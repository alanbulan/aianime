import type { CommercialAnnouncementFeed } from "@/modules/platform_release/domain/commercial-announcement";

export interface CommercialAnnouncementGateway {
  fetch(limit?: number): Promise<CommercialAnnouncementFeed>;
}
