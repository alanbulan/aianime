import type {
  ReleaseFeed,
  ReleaseLocale,
  ReleaseUpgradeStatus,
} from "@/modules/platform_release/domain/release-notifications";

export interface ReleaseNotificationGateway {
  fetch(locale: ReleaseLocale, signal?: AbortSignal): Promise<ReleaseFeed>;
}

export interface ReleaseNotificationStorage {
  isMuted(): boolean;
  markCurrentReleaseSeen(tag: string | null | undefined): void;
  markUpgradeSeen(tag: string | null | undefined): void;
  markUpgradeSkipped(tag: string | null | undefined): void;
  isCurrentReleaseSeen(tag: string | null | undefined): boolean;
  upgradeStatus(tag: string | null | undefined): ReleaseUpgradeStatus;
}
