import type { OkResponse } from "@/types/api";
import { api } from "@/shared/api/transport";
import type { ReleaseNotificationGateway } from "@/modules/platform_release/application/ports";
import type { ReleaseFeed } from "@/modules/platform_release/domain/release-notifications";

export const httpReleaseNotificationGateway: ReleaseNotificationGateway = {
  async fetch(locale, signal) {
    const response = await api
      .get("api/v1/release-notifications", {
        searchParams: { locale },
        signal,
      })
      .json<OkResponse<ReleaseFeed>>();
    return response.data;
  },
};
