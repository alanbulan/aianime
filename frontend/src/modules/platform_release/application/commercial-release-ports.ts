import type { CommercialReleaseStatus } from "@/modules/platform_release/domain/commercial-release";

export interface CommercialReleaseGateway {
  check(): Promise<CommercialReleaseStatus>;
}
