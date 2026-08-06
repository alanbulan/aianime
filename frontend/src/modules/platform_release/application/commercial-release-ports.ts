import type { CommercialReleaseStatus } from "@/modules/platform_release/domain/commercial-release";

export interface CommercialReleaseInstallerResult {
  filePath: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
}

export interface CommercialReleaseGateway {
  check(): Promise<CommercialReleaseStatus>;
  downloadArtifact(
    artifactId: string | number,
  ): Promise<CommercialReleaseInstallerResult>;
  installArtifact(result: CommercialReleaseInstallerResult): Promise<void>;
}
