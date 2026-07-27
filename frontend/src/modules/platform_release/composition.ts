import { createReleaseNotificationQueries } from "@/modules/platform_release/application/query-hooks";
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
import { httpReleaseNotificationGateway } from "@/modules/platform_release/infrastructure/http-release-notification-gateway";
import { BUILD_ID } from "@/lib/app-version";

const releaseNotificationQueries = createReleaseNotificationQueries(
  httpReleaseNotificationGateway,
);

export const {
  ensureReleaseNotifications,
  fetchReleaseNotifications,
  useReleaseNotifications,
} = releaseNotificationQueries;

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
