export {
  ensureReleaseNotifications,
  fetchReleaseNotifications,
  installChunkLoadRecovery,
  installVersionUpdateWatch,
  seedCommercialBootstrapRelease,
  markCurrentReleaseSeen,
  markUpgradeSeen,
  markUpgradeSkipped,
  releaseSeenKey,
  releaseUpgradeKey,
  shouldAutoShowCurrentRelease,
  shouldShowUpgradeNudge,
  useReleaseNotifications,
  useCommercialAnnouncements,
  useCommercialRelease,
  RELEASE_NOTIFICATIONS_MUTED_KEY,
} from "@/modules/platform_release/composition";
export { useChunkLoadRecoveryRequired } from "@/modules/platform_release/application/chunk-load-recovery";
export { AppUpdateAvailable } from "@/modules/platform_release/presentation/AppUpdateAvailable";
export { AppUpdateRequired } from "@/modules/platform_release/presentation/AppUpdateRequired";
export { VersionUpdateDialog } from "@/modules/platform_release/presentation/VersionUpdateDialog";
export { CommercialUpdateRequired } from "@/modules/platform_release/presentation/CommercialUpdateRequired";
export { normalizeReleaseLocale } from "@/modules/platform_release/domain/release-notifications";
export { isChunkLoadError } from "@/modules/platform_release/domain/runtime-update";
export type { CommercialReleaseStatus } from "@/modules/platform_release/domain/commercial-release";
export type {
  CommercialAnnouncement,
  CommercialAnnouncementFeed,
} from "@/modules/platform_release/domain/commercial-announcement";
export type {
  ReleaseAttention,
  ReleaseFeed,
  ReleaseItem,
  ReleaseLocale,
} from "@/modules/platform_release/domain/release-notifications";
