import { useQuery, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { ReleaseNotificationGateway } from "@/modules/platform_release/application/ports";
import { normalizeReleaseLocale } from "@/modules/platform_release/domain/release-notifications";

const RELEASE_FEED_STALE_TIME_MS = 60 * 60 * 1000;

export function createReleaseNotificationQueries(gateway: ReleaseNotificationGateway) {
  function fetchReleaseNotifications(
    localeInput: string | undefined,
    signal?: AbortSignal,
  ) {
    return gateway.fetch(normalizeReleaseLocale(localeInput), signal);
  }

  function releaseNotificationsQueryOptions(localeInput: string | undefined) {
    const locale = normalizeReleaseLocale(localeInput);
    return {
      queryKey: queryKeys.releaseNotifications(locale),
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        fetchReleaseNotifications(locale, signal),
      staleTime: RELEASE_FEED_STALE_TIME_MS,
      refetchOnWindowFocus: true,
    };
  }

  function ensureReleaseNotifications(
    queryClient: QueryClient,
    localeInput: string | undefined,
  ) {
    return queryClient.ensureQueryData(releaseNotificationsQueryOptions(localeInput));
  }

  function useReleaseNotifications(localeOverride?: string) {
    return useQuery(releaseNotificationsQueryOptions(localeOverride));
  }

  return {
    ensureReleaseNotifications,
    fetchReleaseNotifications,
    useReleaseNotifications,
  };
}
