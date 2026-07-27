export {
  ensureReleaseNotifications,
  fetchReleaseNotifications,
  installChunkLoadRecovery,
  installVersionUpdateWatch,
  markCurrentReleaseSeen,
  markUpgradeSeen,
  markUpgradeSkipped,
  releaseSeenKey,
  releaseUpgradeKey,
  shouldAutoShowCurrentRelease,
  shouldShowUpgradeNudge,
  useReleaseNotifications,
  RELEASE_NOTIFICATIONS_MUTED_KEY,
} from "@/modules/platform_release/composition";
export { useChunkLoadRecoveryRequired } from "@/modules/platform_release/application/chunk-load-recovery";
export { AppUpdateAvailable } from "@/modules/platform_release/presentation/AppUpdateAvailable";
export { AppUpdateRequired } from "@/modules/platform_release/presentation/AppUpdateRequired";
export { normalizeReleaseLocale } from "@/modules/platform_release/domain/release-notifications";
export { isChunkLoadError } from "@/modules/platform_release/domain/runtime-update";
export type {
  ReleaseAttention,
  ReleaseFeed,
  ReleaseItem,
  ReleaseLocale,
} from "@/modules/platform_release/domain/release-notifications";
