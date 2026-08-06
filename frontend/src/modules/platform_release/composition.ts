import { createCommercialAnnouncementQueries } from "@/modules/platform_release/application/commercial-announcement-queries";
import { createCommercialReleaseQueries } from "@/modules/platform_release/application/commercial-release-queries";
import type { CommercialReleaseInstallerResult } from "@/modules/platform_release/application/commercial-release-ports";
import type { QueryClient } from "@tanstack/react-query";
import { requestChunkLoadRecovery } from "@/modules/platform_release/application/chunk-load-recovery";
import { markUpdateAvailable } from "@/modules/platform_release/application/update-availability";
import { installBrowserChunkLoadRecovery } from "@/modules/platform_release/infrastructure/browser-chunk-load-recovery";
import { installBrowserVersionUpdateWatch } from "@/modules/platform_release/infrastructure/browser-version-update-watch";
import { subscribeOpenVersionUpdateDialog as subscribeBrowserOpenVersionUpdateDialog } from "@/modules/platform_release/infrastructure/browser-version-update-dialog-events";
import { BUILD_ID } from "@/lib/app-version";
import { queryKeys } from "@/lib/query-keys";
import { parseCommercialBootstrapRelease } from "@/modules/platform_release/domain/commercial-release";
import { electronCommercialAnnouncementGateway } from "@/modules/platform_release/infrastructure/electron-commercial-announcement-gateway";
import { electronCommercialReleaseGateway } from "@/modules/platform_release/infrastructure/electron-commercial-release-gateway";

const commercialAnnouncementQueries = createCommercialAnnouncementQueries(
  electronCommercialAnnouncementGateway,
);
const commercialReleaseQueries = createCommercialReleaseQueries(
  electronCommercialReleaseGateway,
);

export const { useCommercialAnnouncements } = commercialAnnouncementQueries;
export const { useCommercialRelease } = commercialReleaseQueries;

export function downloadCommercialArtifact(
  artifactId: string | number,
): Promise<CommercialReleaseInstallerResult> {
  return electronCommercialReleaseGateway.downloadArtifact(artifactId);
}

export function installCommercialArtifact(
  result: CommercialReleaseInstallerResult,
): Promise<void> {
  return electronCommercialReleaseGateway.installArtifact(result);
}

export function seedCommercialBootstrapRelease(
  queryClient: QueryClient,
  value: unknown,
) {
  const release = parseCommercialBootstrapRelease(value);
  if (release) {
    queryClient.setQueryData(queryKeys.commercialRelease(), release);
  }
  return release;
}

export function installChunkLoadRecovery(): () => void {
  return installBrowserChunkLoadRecovery(requestChunkLoadRecovery);
}

export function installVersionUpdateWatch(): () => void {
  return installBrowserVersionUpdateWatch({
    runningBuildId: BUILD_ID,
    onUpdateAvailable: markUpdateAvailable,
  });
}

export function subscribeOpenVersionUpdateDialog(
  listener: () => void,
): () => void {
  return subscribeBrowserOpenVersionUpdateDialog(listener);
}
