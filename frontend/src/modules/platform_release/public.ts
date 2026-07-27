export {
  ensureReleaseNotifications,
  fetchReleaseNotifications,
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
export { normalizeReleaseLocale } from "@/modules/platform_release/domain/release-notifications";
export type {
  ReleaseAttention,
  ReleaseFeed,
  ReleaseItem,
  ReleaseLocale,
} from "@/modules/platform_release/domain/release-notifications";
