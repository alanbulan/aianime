import type { CommercialReleaseGateway } from "@/modules/platform_release/application/commercial-release-ports";
import {
  parseCommercialReleaseStatus,
  parseCommercialUpdateDownloadProgress,
  parseCommercialUpdateDownloadResult,
  parseCommercialUpdateInstallResult,
  type CommercialUpdateDownloadProgress,
} from "@/modules/platform_release/domain/commercial-release";
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
    return parseCommercialUpdateDownloadResult(
      await invokeCommercial(() => commercial.downloadUpdate(artifactId)),
    );
  },
  async installUpdate() {
    const commercial = requireCommercialBridge(
      "Update install requires the Electron desktop app",
    );
    if (!commercial.installUpdate) {
      throw new Error("Update install requires the Electron desktop app");
    }
    return parseCommercialUpdateInstallResult(
      await invokeCommercial(() => commercial.installUpdate()),
    );
  },
};

const downloadProgressListeners = new Set<
  (progress: CommercialUpdateDownloadProgress) => void
>();
let detachDownloadProgressBridge: (() => void) | null = null;

export function subscribeElectronCommercialUpdateDownloadProgress(
  listener: (progress: CommercialUpdateDownloadProgress) => void,
): () => void {
  downloadProgressListeners.add(listener);
  const bridge = window.aiAnimeDesktop?.commercial;
  if (!detachDownloadProgressBridge && bridge?.onUpdateDownloadProgress) {
    detachDownloadProgressBridge = bridge.onUpdateDownloadProgress((value) => {
      let progress: CommercialUpdateDownloadProgress;
      try {
        progress = parseCommercialUpdateDownloadProgress(value);
      } catch {
        return;
      }
      for (const currentListener of downloadProgressListeners) {
        currentListener(progress);
      }
    });
  }

  return () => {
    downloadProgressListeners.delete(listener);
    if (downloadProgressListeners.size === 0 && detachDownloadProgressBridge) {
      detachDownloadProgressBridge();
      detachDownloadProgressBridge = null;
    }
  };
}
