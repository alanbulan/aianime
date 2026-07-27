export type ReleaseAttention = "low" | "medium" | "high";
export type ReleaseLocale = "zh" | "en";
export type ReleaseUpgradeStatus = "seen" | "skipped" | null;

export interface ReleaseItem {
  id: string;
  kind: string;
  icon: string;
  title: string;
  body: string;
}

export interface ReleaseFeed {
  source: "mock" | "remote" | "none";
  current_version: string | null;
  current_tag: string | null;
  current_items: ReleaseItem[];
  update_available: boolean;
  latest_version: string | null;
  latest_tag: string | null;
  release_url: string | null;
  update_items: ReleaseItem[];
  attention: ReleaseAttention;
  latest_published_at: string | null;
}

export function normalizeReleaseLocale(locale: string | undefined): ReleaseLocale {
  const two = (locale ?? "").slice(0, 2).toLowerCase();
  return two === "en" ? "en" : "zh";
}

export function canAutoShowCurrentRelease(
  feed: ReleaseFeed | null | undefined,
  state: { muted: boolean; seen: boolean },
): boolean {
  return Boolean(
    feed?.current_tag &&
      feed.current_items.length > 0 &&
      !state.muted &&
      !state.seen,
  );
}

export function canShowUpgradeNudge(
  feed: ReleaseFeed | null | undefined,
  state: { muted: boolean; status: ReleaseUpgradeStatus },
): boolean {
  if (!feed?.update_available || !feed.latest_tag) return false;
  if (feed.attention !== "medium" && feed.attention !== "high") return false;
  if (state.muted) return false;
  return state.status !== "seen" && state.status !== "skipped";
}
