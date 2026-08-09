import type { CommercialReleaseGateway } from "@/modules/platform_release/application/commercial-release-ports";
import { parseCommercialReleaseStatus } from "@/modules/platform_release/domain/commercial-release";
import {
  invokeCommercial,
  requireCommercialBridge,
} from "@/shared/commercial-bridge";

export const electronCommercialReleaseGateway: CommercialReleaseGateway = {
  async check() {
    return parseCommercialReleaseStatus(
      await invokeCommercial(() => requireCommercialBridge().checkRelease()),
    );
  },
  async downloadUpdate(artifactId) {
    const commercial = requireCommercialBridge(
      "Update download requires the Electron desktop app",
    );
    if (!commercial.downloadUpdate) {
      throw new Error("Update download requires the Electron desktop app");
    }
    return invokeCommercial(() => commercial.downloadUpdate(artifactId));
  },
  async installUpdate() {
    const commercial = requireCommercialBridge(
      "Update install requires the Electron desktop app",
    );
    if (!commercial.installUpdate) {
      throw new Error("Update install requires the Electron desktop app");
    }
    await invokeCommercial(() => commercial.installUpdate());
  },
};
