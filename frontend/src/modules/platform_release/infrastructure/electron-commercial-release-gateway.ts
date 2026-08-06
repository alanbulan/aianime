import type {
  CommercialReleaseGateway,
  CommercialReleaseInstallerResult,
} from "@/modules/platform_release/application/commercial-release-ports";
import { parseCommercialReleaseStatus } from "@/modules/platform_release/domain/commercial-release";

export const electronCommercialReleaseGateway: CommercialReleaseGateway = {
  async check() {
    const commercial = window.aiAnimeDesktop?.commercial;
    if (!commercial) {
      throw new Error("Commercial Gateway requires the Electron desktop app");
    }
    return parseCommercialReleaseStatus(await commercial.checkRelease());
  },
  async downloadArtifact(artifactId) {
    const commercial = window.aiAnimeDesktop?.commercial;
    if (!commercial?.downloadArtifact) {
      throw new Error(
        "Artifact download requires the Electron desktop app",
      );
    }
    return commercial.downloadArtifact(artifactId);
  },
  async installArtifact(result: CommercialReleaseInstallerResult) {
    const commercial = window.aiAnimeDesktop?.commercial;
    if (!commercial?.installArtifact) {
      throw new Error("Installer launch requires the Electron desktop app");
    }
    await commercial.installArtifact({
      filePath: result.filePath,
      sha256: result.sha256,
    });
  },
};
