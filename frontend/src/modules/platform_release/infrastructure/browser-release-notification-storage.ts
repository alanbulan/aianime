import type { ReleaseNotificationStorage } from "@/modules/platform_release/application/ports";

export const RELEASE_NOTIFICATIONS_MUTED_KEY =
  "ai-anime:release-notifications:muted";

export function releaseSeenKey(tag: string | null | undefined): string | null {
  return tag ? `ai-anime:release-seen:${tag}` : null;
}

export function releaseUpgradeKey(tag: string | null | undefined): string | null {
  return tag ? `ai-anime:release-upgrade:${tag}` : null;
}

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export const browserReleaseNotificationStorage: ReleaseNotificationStorage = {
  isMuted() {
    return storage()?.getItem(RELEASE_NOTIFICATIONS_MUTED_KEY) === "true";
  },
  markCurrentReleaseSeen(tag) {
    const key = releaseSeenKey(tag);
    if (key) storage()?.setItem(key, "seen");
  },
  markUpgradeSeen(tag) {
    const key = releaseUpgradeKey(tag);
    if (key) storage()?.setItem(key, "seen");
  },
  markUpgradeSkipped(tag) {
    const key = releaseUpgradeKey(tag);
    if (key) storage()?.setItem(key, "skipped");
  },
  isCurrentReleaseSeen(tag) {
    const key = releaseSeenKey(tag);
    return key ? storage()?.getItem(key) === "seen" : false;
  },
  upgradeStatus(tag) {
    const key = releaseUpgradeKey(tag);
    const value = key ? storage()?.getItem(key) : null;
    return value === "seen" || value === "skipped" ? value : null;
  },
};
