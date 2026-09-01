import type { CommercialReleaseStatus } from "@/modules/platform_release/domain/commercial-release";

export interface CommercialReleaseGateway {
  check(): Promise<CommercialReleaseStatus>;
  downloadUpdate(
    artifactId: string,
  ): Promise<{ version: string }>;
  installUpdate(): Promise<{ accepted: boolean }>;
}
