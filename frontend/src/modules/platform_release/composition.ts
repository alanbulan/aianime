import { createReleaseNotificationQueries } from "@/modules/platform_release/application/query-hooks";
import { createCommercialAnnouncementQueries } from "@/modules/platform_release/application/commercial-announcement-queries";
import { createCommercialReleaseQueries } from "@/modules/platform_release/application/commercial-release-queries";
import type { QueryClient } from "@tanstack/react-query";
import { requestChunkLoadRecovery } from "@/modules/platform_release/application/chunk-load-recovery";
import { markUpdateAvailable } from "@/modules/platform_release/application/update-availability";
import {
  canAutoShowCurrentRelease,
  canShowUpgradeNudge,
  type ReleaseFeed,
} from "@/modules/platform_release/domain/release-notifications";
import {
  browserReleaseNotificationStorage,
  releaseSeenKey,
  releaseUpgradeKey,
  RELEASE_NOTIFICATIONS_MUTED_KEY,
} from "@/modules/platform_release/infrastructure/browser-release-notification-storage";
import { installBrowserChunkLoadRecovery } from "@/modules/platform_release/infrastructure/browser-chunk-load-recovery";
import { installBrowserVersionUpdateWatch } from "@/modules/platform_release/infrastructure/browser-version-update-watch";
import { subscribeOpenVersionUpdateDialog as subscribeBrowserOpenVersionUpdateDialog } from "@/modules/platform_release/infrastructure/browser-version-update-dialog-events";
import { httpReleaseNotificationGateway } from "@/modules/platform_release/infrastructure/http-release-notification-gateway";
import { BUILD_ID } from "@/lib/app-version";
import { queryKeys } from "@/lib/query-keys";
import { parseCommercialBootstrapRelease } from "@/modules/platform_release/domain/commercial-release";
import { electronCommercialAnnouncementGateway } from "@/modules/platform_release/infrastructure/electron-commercial-announcement-gateway";
import { electronCommercialReleaseGateway } from "@/modules/platform_release/infrastructure/electron-commercial-release-gateway";

const releaseNotificationQueries = createReleaseNotificationQueries(
  httpReleaseNotificationGateway,
);
const commercialAnnouncementQueries = createCommercialAnnouncementQueries(
  electronCommercialAnnouncementGateway,
);
const commercialReleaseQueries = createCommercialReleaseQueries(
  electronCommercialReleaseGateway,
);

export const {
  ensureReleaseNotifications,
  fetchReleaseNotifications,
  useReleaseNotifications,
} = releaseNotificationQueries;
export const { useCommercialAnnouncements } = commercialAnnouncementQueries;
export const { useCommercialRelease } = commercialReleaseQueries;

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

export {
  releaseSeenKey,
  releaseUpgradeKey,
  RELEASE_NOTIFICATIONS_MUTED_KEY,
};

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

export function markCurrentReleaseSeen(tag: string | null | undefined): void {
  browserReleaseNotificationStorage.markCurrentReleaseSeen(tag);
}

export function markUpgradeSeen(tag: string | null | undefined): void {
  browserReleaseNotificationStorage.markUpgradeSeen(tag);
}

export function markUpgradeSkipped(tag: string | null | undefined): void {
  browserReleaseNotificationStorage.markUpgradeSkipped(tag);
}

export function shouldAutoShowCurrentRelease(
  feed: ReleaseFeed | null | undefined,
): boolean {
  return canAutoShowCurrentRelease(feed, {
    muted: browserReleaseNotificationStorage.isMuted(),
    seen: browserReleaseNotificationStorage.isCurrentReleaseSeen(
      feed?.current_tag,
    ),
  });
}

export function shouldShowUpgradeNudge(
  feed: ReleaseFeed | null | undefined,
): boolean {
  return canShowUpgradeNudge(feed, {
    muted: browserReleaseNotificationStorage.isMuted(),
    status: browserReleaseNotificationStorage.upgradeStatus(feed?.latest_tag),
  });
}
